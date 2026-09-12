import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { z, ZodError } from 'zod';
import * as auth from './auth.js';
import { config, origins } from './config.js';
import { pool } from './db.js';
import { AppError, roles } from './model.js';
import { createRealtime } from './realtime.js';
import * as repo from './repository.js';
import * as service from './services.js';
import * as validation from './validation.js';
export function createApplication() {
  const app = express(),
    http = createServer(app),
    live = createRealtime(http);
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY);
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const limitMessage = {
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
  };
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
  );
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  // Origin + non-simple header protects cookie-authenticated actions from CSRF, including login CSRF.
  app.use('/api/auth', (req, _res, next) => {
    if (req.method === 'GET') return next();
    if (
      !origins.includes(req.headers.origin || '') ||
      req.headers['x-requested-with'] !== 'Fieldwork'
    )
      return next(
        new AppError(
          403,
          'ORIGIN_REJECTED',
          'This request did not come from an allowed application.',
        ),
      );
    next();
  });
  app.post(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      skipSuccessfulRequests: true,
      message: limitMessage,
    }),
    async (req, res) => {
      const data = validation.loginInput.parse(req.body);
      auth.sendSession(res, await auth.login(data.email, data.password));
    },
  );
  app.post('/api/auth/refresh', async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    const token = req.cookies[auth.refreshCookie];
    if (typeof token !== 'string')
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    try {
      auth.sendSession(res, await auth.rotate(token));
    } catch (error) {
      const sid = await auth.logout(token);
      if (sid) live.disconnectSession(sid);
      auth.clearSession(res);
      throw error;
    }
  });
  app.post('/api/auth/logout', async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    const sid = await auth.logout(req.cookies[auth.refreshCookie]);
    if (sid) live.disconnectSession(sid);
    auth.clearSession(res);
    res.status(204).end();
  });
  app.use('/api', auth.authenticate, auth.allow(...roles));
  app.get('/api/auth/me', (req, res) => res.json({ user: req.identity }));
  app.get('/api/dashboard', async (req, res) =>
    res.json({
      ...(await repo.dashboard(req.identity)),
      ...(req.identity.role === 'ADMIN' ? { online: live.onlineCount() } : {}),
    }),
  );
  app.get('/api/projects', async (req, res) =>
    res.json({ items: await repo.listProjects(req.identity) }),
  );
  app.post('/api/projects', auth.allow('ADMIN', 'PM'), async (req, res) =>
    res
      .status(201)
      .json(await service.createProject(req.identity, validation.projectInput.parse(req.body))),
  );
  app.patch('/api/projects/:id', auth.allow('ADMIN', 'PM'), async (req, res) =>
    res.json(
      await service.editProject(
        req.identity,
        validation.id.parse(req.params.id),
        validation.projectEdit.parse(req.body),
      ),
    ),
  );
  app.get('/api/tasks', async (req, res) =>
    res.json(await repo.listTasks(req.identity, validation.filters.parse(req.query))),
  );
  app.get('/api/tasks/:id', async (req, res) =>
    res.json(await repo.accessibleTask(req.identity, validation.id.parse(req.params.id))),
  );
  app.post('/api/projects/:id/tasks', auth.allow('ADMIN', 'PM'), async (req, res) =>
    res
      .status(201)
      .json(
        await service.createTask(
          req.identity,
          validation.id.parse(req.params.id),
          validation.taskInput.parse(req.body),
        ),
      ),
  );
  app.patch('/api/tasks/:id', auth.allow('ADMIN', 'PM'), async (req, res) =>
    res.json(
      await service.updateTask(
        req.identity,
        validation.id.parse(req.params.id),
        validation.taskEdit.parse(req.body),
      ),
    ),
  );
  app.patch('/api/tasks/:id/status', async (req, res) =>
    res.json(
      await service.updateTask(
        req.identity,
        validation.id.parse(req.params.id),
        validation.statusInput.parse(req.body),
      ),
    ),
  );
  app.get('/api/activity', async (req, res) =>
    res.json(await repo.getActivity(req.identity, validation.activityFilters.parse(req.query))),
  );
  app.get('/api/notifications', async (req, res) =>
    res.json(await repo.notificationState(req.identity)),
  );
  app.patch('/api/notifications/read-all', async (req, res) => {
    z.object({}).strict().parse(req.body);
    await repo.readNotifications(req.identity);
    await live.notify(req.identity);
    res.status(204).end();
  });
  app.patch('/api/notifications/:id/read', async (req, res) => {
    z.object({}).strict().parse(req.body);
    const id = z
      .string()
      .regex(/^\d{1,18}$/)
      .parse(req.params.id);
    await repo.readNotifications(req.identity, id);
    await live.notify(req.identity);
    res.status(204).end();
  });
  app.get('/api/clients', auth.allow('ADMIN', 'PM'), async (req, res) =>
    res.json({ items: await service.getClients(req.identity) }),
  );
  app.post('/api/clients', auth.allow('ADMIN'), async (req, res) =>
    res.status(201).json(await service.saveClient(validation.clientInput.parse(req.body))),
  );
  app.put('/api/clients/:id', auth.allow('ADMIN'), async (req, res) =>
    res.json(
      await service.saveClient(
        validation.clientInput.parse(req.body),
        validation.id.parse(req.params.id),
      ),
    ),
  );
  app.get('/api/users', auth.allow('ADMIN', 'PM'), async (req, res) =>
    res.json({ items: await service.getUsers(req.identity) }),
  );
  app.post('/api/users', auth.allow('ADMIN'), async (req, res) =>
    res.status(201).json(await service.createUser(validation.userInput.parse(req.body))),
  );
  app.patch('/api/users/:id', auth.allow('ADMIN'), async (req, res) =>
    res.json(
      await service.editUser(
        req.identity,
        z.uuid().parse(req.params.id),
        validation.userEdit.parse(req.body),
      ),
    ),
  );
  app.use((_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'This endpoint does not exist.')),
  );
  const errorHandler: express.ErrorRequestHandler = (error, req, res, _next) => {
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = 'Something went wrong. Please try again.',
      details: unknown;
    if (error instanceof AppError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Check the submitted fields.';
      details = error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    } else if (error?.code === '23505') {
      status = 409;
      code = 'ALREADY_EXISTS';
      message = 'A record with these details already exists.';
    } else if (error?.code === '23503') {
      status = 400;
      code = 'INVALID_REFERENCE';
      message = 'A referenced record does not exist or is still in use.';
    } else if (error?.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Request body must be valid JSON.';
    } else if (error?.type === 'entity.too.large') {
      status = 413;
      code = 'BODY_TOO_LARGE';
      message = 'The request is too large.';
    } else console.error(`[${req.requestId}]`, error);
    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}), requestId: req.requestId },
    });
  };
  app.use(errorHandler);
  return { app, http, live };
}
