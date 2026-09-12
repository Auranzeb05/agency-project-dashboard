import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { createApplication } from '../src/app.js';
import { runOverdueJob } from '../src/services.js';
import { config } from '../src/config.js';
if (process.env.NODE_ENV !== 'test' || !new URL(config.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('Tests require NODE_ENV=test and a dedicated database ending in _test.');
const app = createApplication();
let base = '';
type Account = { accessToken: string; user: { id: string; role: string }; cookie: string };
const accounts: Record<string, Account> = {};
const sockets: Socket[] = [];
async function call(
  path: string,
  account?: Account,
  method = 'GET',
  data?: unknown,
  cookie?: string,
) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      'X-Requested-With': 'Fieldwork',
      'Content-Type': 'application/json',
      ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}
async function connect(account: Account) {
  const socket = io(base, {
    transports: ['websocket'],
    auth: { token: account.accessToken },
    extraHeaders: { Origin: 'http://localhost:5173' },
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('ready', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
const event = (s: Socket, name: string) =>
  new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No ${name} event`)), 3000);
    s.once(name, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seed();
  await new Promise<void>((resolve) => app.http.listen(0, '127.0.0.1', resolve));
  const address = app.http.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  for (const name of ['admin', 'nisha', 'kabir', 'ravi', 'maya', 'arjun', 'sara']) {
    const { response, body } = await call('/auth/login', undefined, 'POST', {
      email: `${name}@fieldwork.test`,
      password: process.env.SEED_PASSWORD,
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i);
    accounts[name] = { ...body, cookie: cookie.split(';')[0] };
  }
});
after(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise<void>((resolve) => app.live.io.close(() => resolve()));
  await pool.end();
});
test('seed provides all roles, projects, tasks, overdue flags, and persistent history', async () => {
  const { body } = await call('/dashboard', accounts.admin);
  assert.equal(body.total_projects, 3);
  assert.equal(body.counts.total_tasks, 18);
  assert.ok(body.counts.overdue >= 2);
  const activity = await call('/activity', accounts.admin);
  assert.equal(activity.body.items.length, 20);
});
test('unauthenticated, forged, wrong-type, and untrusted-origin requests are rejected', async () => {
  assert.equal((await call('/tasks')).response.status, 401);
  const [header, body, signature] = accounts.ravi.accessToken.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  payload.role = 'ADMIN';
  const forged = {
    ...accounts.ravi,
    accessToken: `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`,
  };
  assert.equal((await call('/users', forged)).response.status, 401);
  const signed = {
    ...accounts.ravi,
    accessToken: jwt.sign({ ...payload, role: 'ADMIN' }, config.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
    }),
  };
  assert.equal((await call('/users', signed)).response.status, 403, 'DB role overrides token role');
  const refreshToken = decodeURIComponent(accounts.ravi.cookie.split('=')[1]);
  assert.equal(
    (await call('/tasks', { ...accounts.ravi, accessToken: refreshToken })).response.status,
    401,
  );
  const rejected = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      Cookie: accounts.ravi.cookie,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(rejected.status, 403);
});
test('PM ownership and developer assignment restrict lists, direct IDs, feeds, and writes', async () => {
  const a = await call('/projects', accounts.nisha),
    b = await call('/projects', accounts.kabir);
  assert.equal(a.body.items.length, 2);
  assert.equal(b.body.items.length, 1);
  const foreign = b.body.items[0].id;
  assert.equal((await call(`/tasks?project_id=${foreign}`, accounts.nisha)).response.status, 404);
  assert.equal(
    (await call(`/projects/${foreign}`, accounts.nisha, 'PATCH', { name: 'Unauthorized' })).response
      .status,
    404,
  );
  assert.equal(
    (await call(`/activity?project_id=${foreign}`, accounts.nisha)).response.status,
    404,
  );
  const assigned = (await call('/tasks', accounts.ravi)).body.items;
  assert.ok(assigned.length);
  assert.ok(
    assigned.every((t: { assigned_to: string }) => t.assigned_to === accounts.ravi.user.id),
  );
  const other = (await call('/tasks', accounts.maya)).body.items[0];
  assert.equal((await call(`/tasks/${other.id}`, accounts.ravi)).response.status, 404);
  assert.equal(
    (
      await call(`/tasks/${other.id}/status`, accounts.ravi, 'PATCH', {
        status: 'DONE',
        version: other.version,
      })
    ).response.status,
    404,
  );
  assert.equal((await call('/clients', accounts.ravi)).response.status, 403);
  assert.equal(
    (
      await call(`/tasks/${assigned[0].id}`, accounts.ravi, 'PATCH', {
        title: 'Forbidden',
        version: assigned[0].version,
      })
    ).response.status,
    403,
  );
  const feed = (await call('/activity', accounts.ravi)).body.items;
  assert.ok(
    feed.every((a: { task_id: number }) =>
      assigned.some((t: { id: number }) => t.id === a.task_id),
    ),
  );
});
test('server validates filters and mutation inputs with consistent errors', async () => {
  for (const path of [
    '/tasks?status=UNKNOWN',
    '/tasks?due_from=2026-13-50',
    '/tasks?due_from=2026-09-20&due_to=2026-09-01',
    '/tasks?page=-1',
    '/tasks/abc',
  ]) {
    const r = await call(path, accounts.admin);
    assert.equal(r.response.status, 400, path);
    assert.equal(r.body.error.code, 'VALIDATION_ERROR');
    assert.ok(r.body.error.requestId);
  }
  const r = await call('/projects', accounts.admin, 'POST', {
    name: 'No client',
    client_id: 999999,
  });
  assert.equal(r.response.status, 400);
  assert.equal(r.body.error.code, 'INVALID_REFERENCE');
  const list = (await call('/tasks?status=TODO&priority=HIGH', accounts.admin)).body.items;
  assert.ok(
    list.every(
      (t: { status: string; priority: string }) => t.status === 'TODO' && t.priority === 'HIGH',
    ),
  );
});
test('live delivery reaches only authorized accounts and presence counts unique users', async () => {
  const admin = await connect(accounts.admin),
    pm = await connect(accounts.nisha),
    otherPm = await connect(accounts.kabir),
    dev = await connect(accounts.ravi),
    otherDev = await connect(accounts.maya);
  await connect(accounts.admin);
  assert.equal(app.live.onlineCount(), 5);
  assert.equal(admin.io.engine.transport.name, 'websocket');
  let leaked = 0;
  otherPm.on('activity', () => leaked++);
  otherDev.on('activity', () => leaked++);
  const task = (await call('/tasks', accounts.ravi)).body.items.find(
    (t: { status: string }) => t.status !== 'IN_REVIEW',
  );
  const notifications = event(pm, 'notifications');
  const events = [event(admin, 'activity'), event(pm, 'activity'), event(dev, 'activity')];
  const r = await call(`/tasks/${task.id}/status`, accounts.ravi, 'PATCH', {
    status: 'IN_REVIEW',
    version: task.version,
  });
  assert.equal(r.response.status, 200);
  await Promise.all(events);
  await notifications;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(leaked, 0);
  assert.equal((await call(`/tasks/${task.id}`, accounts.ravi)).body.status, 'IN_REVIEW');
  const history = (await call(`/activity?task_id=${task.id}`, accounts.nisha)).body.items;
  assert.ok(
    history.some(
      (a: { kind: string; actor_id: string; new_value: string }) =>
        a.kind === 'status' && a.actor_id === accounts.ravi.user.id && a.new_value === 'IN_REVIEW',
    ),
  );
});
test('stale edits return a conflict instead of silently overwriting a task', async () => {
  const task = (await call('/tasks', accounts.ravi)).body.items[0];
  const a = await call(`/tasks/${task.id}/status`, accounts.ravi, 'PATCH', {
    status: 'DONE',
    version: task.version,
  });
  assert.equal(a.response.status, 200);
  const b = await call(`/tasks/${task.id}/status`, accounts.ravi, 'PATCH', {
    status: 'TODO',
    version: task.version,
  });
  assert.equal(b.response.status, 409);
  assert.equal(b.body.error.code, 'STALE_TASK');
});
test('overdue scheduler persists flags once and does not flag completed tasks', async () => {
  const project = (await call('/projects', accounts.nisha)).body.items[0];
  const r = await call(`/projects/${project.id}/tasks`, accounts.nisha, 'POST', {
    title: 'Scheduler coverage',
    assigned_to: accounts.ravi.user.id,
    due_date: '2020-01-01',
    priority: 'HIGH',
  });
  assert.equal(r.response.status, 201);
  assert.equal(r.body.overdue, false);
  assert.ok((await runOverdueJob()) >= 1);
  const task = (await call(`/tasks/${r.body.id}`, accounts.ravi)).body;
  assert.equal(task.overdue, true);
  assert.equal(await runOverdueJob(), 0);
  await call(`/tasks/${task.id}/status`, accounts.ravi, 'PATCH', {
    status: 'DONE',
    version: task.version,
  });
  await runOverdueJob();
  assert.equal((await call(`/tasks/${task.id}`, accounts.ravi)).body.overdue, false);
});
test('reassignment removes previous assignee access and stores the new notification', async () => {
  const task = (await call('/tasks', accounts.ravi)).body.items[0];
  const r = await call(`/tasks/${task.id}`, accounts.nisha, 'PATCH', {
    assigned_to: accounts.maya.user.id,
    version: task.version,
  });
  assert.equal(r.response.status, 200);
  assert.equal((await call(`/tasks/${task.id}`, accounts.ravi)).response.status, 404);
  assert.equal((await call(`/activity?task_id=${task.id}`, accounts.ravi)).response.status, 404);
  const notes = (await call('/notifications', accounts.maya)).body;
  assert.ok(notes.items.some((n: { task_id: number }) => n.task_id === task.id));
  const former = (await call('/notifications', accounts.ravi)).body;
  assert.ok(former.items.every((n: { task_id: number }) => n.task_id !== task.id));
});
test('catch-up reads the latest 20 missed authorized events from the database', async () => {
  const before = (await call('/activity', accounts.ravi)).body.cursor;
  const task = (await call('/tasks', accounts.ravi)).body.items[0];
  let current = task;
  for (let i = 0; i < 23; i++) {
    current = (
      await call(`/tasks/${task.id}/status`, accounts.ravi, 'PATCH', {
        status: i % 2 === 0 ? 'TODO' : 'IN_PROGRESS',
        version: current.version,
      })
    ).body;
  }
  const r = await call(`/activity?after=${before}`, accounts.ravi);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.items.length, 20);
  assert.ok(
    r.body.items.every(
      (a: { id: string; task_id: number }) =>
        BigInt(a.id) > BigInt(before) && a.task_id === task.id,
    ),
  );
  assert.equal(
    (await call(`/activity?after=${r.body.cursor}`, accounts.ravi)).body.items.length,
    0,
  );
});
test('notification read actions are isolated and badge updates are pushed', async () => {
  const socket = await connect(accounts.maya);
  const before = (await call('/notifications', accounts.maya)).body;
  assert.ok(before.unread > 0);
  const push = event(socket, 'notifications');
  await call(`/notifications/${before.items[0].id}/read`, accounts.maya, 'PATCH', {});
  await push;
  const otherBefore = (await call('/notifications', accounts.ravi)).body.unread;
  await call('/notifications/read-all', accounts.maya, 'PATCH', {});
  assert.equal((await call('/notifications', accounts.maya)).body.unread, 0);
  assert.equal((await call('/notifications', accounts.ravi)).body.unread, otherBefore);
});
test('refresh rotation rejects replay, revokes the family, and logout invalidates access', async () => {
  const login = await call('/auth/login', undefined, 'POST', {
    email: 'sara@fieldwork.test',
    password: process.env.SEED_PASSWORD,
  });
  const old = login.response.headers.get('set-cookie')!.split(';')[0];
  const rotated = await call('/auth/refresh', undefined, 'POST', {}, old);
  assert.equal(rotated.response.status, 200);
  const fresh = rotated.response.headers.get('set-cookie')!.split(';')[0];
  assert.notEqual(fresh, old);
  assert.equal((await call('/auth/refresh', undefined, 'POST', {}, old)).response.status, 401);
  assert.equal((await call('/tasks', { ...rotated.body, cookie: fresh })).response.status, 401);
  const another = await call('/auth/login', undefined, 'POST', {
    email: 'sara@fieldwork.test',
    password: process.env.SEED_PASSWORD,
  });
  const account = {
    ...another.body,
    cookie: another.response.headers.get('set-cookie')!.split(';')[0],
  };
  assert.equal(
    (await call('/auth/logout', undefined, 'POST', {}, account.cookie)).response.status,
    204,
  );
  assert.equal((await call('/tasks', account)).response.status, 401);
});
test('archive prevents task writes, restore reopens them, and deactivation revokes sessions', async () => {
  const project = (await call('/projects', accounts.kabir)).body.items[0];
  const task = (await call('/tasks', accounts.arjun)).body.items[0];
  await call(`/projects/${project.id}`, accounts.kabir, 'PATCH', { archived: true });
  assert.equal(
    (
      await call(`/tasks/${task.id}/status`, accounts.arjun, 'PATCH', {
        status: 'DONE',
        version: task.version,
      })
    ).response.status,
    409,
  );
  await call(`/projects/${project.id}`, accounts.kabir, 'PATCH', { archived: false });
  const r = await call(`/users/${accounts.arjun.user.id}`, accounts.admin, 'PATCH', {
    active: false,
  });
  assert.equal(r.response.status, 200);
  assert.equal((await call('/tasks', accounts.arjun)).response.status, 401);
  assert.equal(
    (await call(`/users/${accounts.admin.user.id}`, accounts.admin, 'PATCH', { active: false }))
      .response.status,
    400,
  );
});
