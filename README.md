# Fieldwork

A client project workspace for a small agency. Administrators see the whole operation, project managers manage their own projects, and developers see only their assigned work.

Built with React, TypeScript, Express, PostgreSQL, Socket.IO, and node-cron.

## Run locally

Requires Node.js 22+ and Docker with Compose. No cloud accounts are needed for local development.

```bash
npm ci
npm run setup
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173**. The API runs on port 4000. `npm run setup` creates an ignored `.env` with different random JWT secrets, a database password, and a seed password. It never overwrites an existing `.env`.

If port 5432 already belongs to another PostgreSQL installation, use that database and update `DATABASE_URL`, or change the Compose port mapping and the URL together.

### Seed accounts

Every seeded account uses the value of **`SEED_PASSWORD` in your local `.env`**. Credentials are deliberately absent from source control and the login screen.

| Role            | Email                  |
| --------------- | ---------------------- |
| Admin           | `admin@fieldwork.test` |
| Project manager | `nisha@fieldwork.test` |
| Project manager | `kabir@fieldwork.test` |
| Developer       | `ravi@fieldwork.test`  |
| Developer       | `maya@fieldwork.test`  |
| Developer       | `arjun@fieldwork.test` |
| Developer       | `sara@fieldwork.test`  |

The seed creates 3 clients, 3 projects, 18 tasks in all four statuses, 6 overdue tasks, activity history, and assignment/review notifications. Nisha owns Atlas and Northline; Kabir owns Orbit. Ravi and Maya work on Nisha's projects; Arjun and Sara work on Kabir's. Seeding a database that already has users leaves its data intact.

### All services in Docker

```bash
npm run setup
docker compose --profile full up --build -d
docker compose exec api node apps/api/dist/seed.js
```

Open the same frontend URL. The API applies migrations at startup. `docker compose down` stops the services while keeping the database volume. Do not use `down -v` unless you intend to delete local data.

## What is included

- JWT access tokens in memory; rotating JWT refresh tokens in an HttpOnly cookie.
- API authentication and role checks, plus project ownership and task-assignment checks on every data path.
- Client, project, team, and task management; archived projects remain readable and can be restored.
- Task status, priority, UTC due date, assignee, description, and immutable activity records.
- Optimistic task versions: a stale edit returns `409 STALE_TASK` rather than overwriting a newer change.
- WebSocket-only live updates and unique-user presence. Long-polling fallback is disabled on both ends.
- Database catch-up for the latest 20 missed, authorized activity events.
- Persistent assignment/review notifications, individual/read-all actions, and live unread badges.
- Scheduled overdue detection, independent of page loads.
- Role-specific dashboards, task pagination, and shareable status/priority/date filters.
- Desktop and mobile layouts, keyboard-accessible dialogs, loading states, and errors with recovery actions.

A filter URL looks like `/tasks?status=IN_REVIEW&priority=HIGH&due_from=2026-09-01&due_to=2026-09-30`. Project lists and task detail endpoints apply the same access rules as the dashboard.

## Architecture

```text
apps/api/src/
  app.ts           HTTP routes, validation, middleware, structured errors
  auth.ts          Token issuance, refresh rotation, session validation
  repository.ts    Scoped reads and shared query helpers
  services.ts      Transactional changes and their business rules
  realtime.ts      Private delivery, session revalidation, presence
  index.ts         Server lifecycle and overdue schedule
  migrate.ts       Ordered migrations with a database lock
  seed.ts          Repeatable initial fixture creation
apps/api/migrations/  PostgreSQL schema and indexes
apps/web/src/
  App.tsx          Role-aware routes and working screens
  api.ts           In-memory access token and refresh coordination
  session.tsx      Authentication state, sockets, and reconnect catch-up
  forms.tsx        Project, task, client, and user editors
  components.tsx   Task table, activity list, dialogs, and common UI
  types.ts         Frontend data contracts
```

SQL uses bound parameters. Controllers do not assemble SQL. Explicit SQL keeps ownership conditions visible and makes relational constraints and query plans straightforward to review. React Query owns server state; component state holds only temporary UI concerns such as open dialogs. Filter state lives in the URL.

Read [the architecture notes](docs/architecture.md) for schema relationships, index decisions, event ordering, and security boundaries. See [the API reference](docs/api.md) for routes and response shapes.

## Verification

```bash
npm run typecheck
npm run build
npm run format:check
```

Integration tests require a **disposable database whose name ends in `_test`**. Set `NODE_ENV=test` and point `DATABASE_URL` at it. The test suite resets its schema; its guard prevents it from running against a normally named application database.

```bash
# Export a connection URL for your own disposable test database first.
export NODE_ENV=test
export DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/agency_test'
npm test
npm run test:prepare
npx playwright install chromium
npm run test:e2e
```

The 12 integration tests cover authorization, tampered tokens, current database roles, role-scoped feeds, input validation, real WebSocket clients, unique presence, stale edits, overdue jobs, reassignment, missed-event catch-up, notification isolation, refresh replay, logout, archive/restore, and deactivation. Browser tests cover management workflows, multiple roles, filter reloads, cross-browser updates, notifications, mobile layout, and dialogs. GitHub Actions runs both suites against PostgreSQL 17 and retains browser results for seven days.

A local development check also ran the integration suite against PostgreSQL compiled to WebAssembly through a wire-protocol test adapter. That adapter is not an application dependency or a production database substitute; GitHub's PostgreSQL service is the deployment-relevant integration target.

## Deploy

The repository contains a Vercel frontend configuration, an API Dockerfile, and an optional Render blueprint for a continuously running API and PostgreSQL database. **The hosting accounts and live deployment still need to be configured.** No application URL is claimed until deployment has been verified.

Follow [the deployment guide](docs/deployment.md). The chosen deployment uses a single persistent API instance so node-cron and process-local presence have well-defined ownership. Vercel's current WebSocket beta does support socket endpoints; this implementation does not rely on function instances staying alive or sharing in-memory state.

## Deliberate boundaries

- A single API process owns live delivery and presence. Multiple API replicas require a shared Socket.IO adapter and distributed presence before enabling horizontal scaling.
- Due dates are whole UTC dates. A task becomes overdue after its due date ends, normally within one scheduler minute. Done tasks are excluded. Archived projects keep their historical tasks and counts.
- A PM can select any active developer by name and an existing client by name/company when assigning work. They cannot browse another PM's projects, task data, activity, or client contact email. A team is defined by assignments within a PM's projects.
- Reassigning a task immediately removes the former developer's access to that task, its history, and its notifications. History visibility follows current assignment.
- Catch-up returns the latest 20 missed events. It is a bounded recovery window, not an export of every offline change. Cursors are stored per user/device; clearing browser storage starts with recent authorized history.
- JWT sessions have a seven-day absolute lifetime. Password reset email, invitations, uploads, comments, and billing are outside this assessment's scope.
- Notification lists show the most recent 50 visible entries; unread counts include older visible notifications. Read-all covers them too.
- A committed change is durable even if live delivery fails. Reconnection and focus refresh reconcile database state; an outbox would make delivery retries durable.

See [the submission explanation](docs/submission-explanation.md) for a 150–250-word description of the main engineering trade-off.
