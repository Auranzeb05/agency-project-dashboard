# Fieldwork

> A secure, real-time project operations workspace for small agencies.

[![Verify application](https://github.com/Auranzeb05/agency-project-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Auranzeb05/agency-project-dashboard/actions/workflows/ci.yml)
[![Live application](https://img.shields.io/badge/Live%20application-Vercel-111111?logo=vercel)](https://agency-project-dashboard.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Fieldwork brings client work, projects, tasks, activity, and team access into one focused workspace. Administrators can oversee the agency, project managers work within their own portfolio, and developers see only the tasks assigned to them. Every sensitive read and write is scoped again on the server.

## Live demo

- **Application:** [agency-project-dashboard.vercel.app](https://agency-project-dashboard.vercel.app)
- **API health:** [fieldwork-api-bfyz.onrender.com/api/health](https://fieldwork-api-bfyz.onrender.com/api/health)
- **Demo administrator:** `admin@fieldwork.test`
- **Password:** provided privately with the submission

> The API uses Render's free tier and can take approximately one minute to wake after a period of inactivity.

## Product highlights

- Role-aware dashboards for administrators, project managers, and developers
- Client, project, user, and task management with server-enforced ownership rules
- Task status, priority, assignee, due date, description, and immutable activity history
- Live task, activity, notification, and presence updates over authenticated WebSockets
- Persistent assignment and review notifications with individual and read-all actions
- URL-based status, priority, and due-date filters that survive refresh and can be shared
- Archived project history with restore support
- Scheduled overdue detection independent of page visits
- Optimistic concurrency control that prevents stale task edits from overwriting newer work
- Responsive layouts, accessible dialogs, keyboard navigation, and recoverable error states

## Roles and access

| Role                | Workspace access                                                         |
| ------------------- | ------------------------------------------------------------------------ |
| **Administrator**   | Full operational view; manages clients, users, projects, and tasks       |
| **Project manager** | Manages owned projects and their tasks; sees only relevant team activity |
| **Developer**       | Sees assigned work and permitted project context; updates task progress  |

Authorization is enforced by the API and SQL query scope. Hiding a control in the frontend is never treated as a security boundary.

## Technology

| Layer           | Stack                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| Frontend        | React 19, TypeScript, Vite, React Router, TanStack Query                  |
| Backend         | Node.js, Express, TypeScript, Zod                                         |
| Database        | PostgreSQL 17 with explicit SQL migrations and indexed relational queries |
| Real time       | Socket.IO using authenticated WebSocket-only connections                  |
| Authentication  | Short-lived JWT access tokens and rotating HttpOnly refresh cookies       |
| Background work | `node-cron` overdue-task scheduler                                        |
| Testing         | Node test runner, real PostgreSQL integration tests, Playwright           |
| Delivery        | GitHub Actions, Vercel, Render, Docker Compose                            |

## Architecture

```mermaid
flowchart LR
    Browser[React application] -->|HTTPS + JWT| API[Express API]
    Browser <-->|Authenticated WebSocket| API
    API -->|Parameterized SQL| DB[(PostgreSQL)]
    Scheduler[Overdue scheduler] --> API
```

The frontend keeps access tokens in memory and sends the refresh token only as a secure HttpOnly cookie. The API owns authentication, authorization, validation, transactions, event creation, and notification delivery. PostgreSQL is the source of truth; live events accelerate the interface but never replace durable writes.

### Reliability and data integrity

- Refresh tokens rotate on use, and replay invalidates the associated session family.
- Task rows carry versions; stale writes return `409 STALE_TASK`.
- Mutations and their activity records commit in the same database transaction.
- Reconnection catch-up restores the latest authorized events after a temporary disconnect.
- Reassignment immediately changes task, history, and notification visibility.
- SQL uses bound parameters, and ownership conditions remain explicit in repository queries.

## Run locally

### Requirements

- Node.js 22 or newer
- Docker Desktop with Docker Compose

### Setup

```bash
git clone https://github.com/Auranzeb05/agency-project-dashboard.git
cd agency-project-dashboard
npm ci
npm run setup
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API listens on [http://localhost:4000](http://localhost:4000).

`npm run setup` creates an ignored `.env` containing independent JWT secrets, a database password, and a seed password. It never overwrites an existing file. If PostgreSQL is still starting, wait for it before running migrations:

```bash
until docker compose exec -T db pg_isready -U agency -d agency; do sleep 1; done
```

### Seed accounts

All seeded accounts use the `SEED_PASSWORD` value from the local `.env` file.

| Role            | Email                  |
| --------------- | ---------------------- |
| Administrator   | `admin@fieldwork.test` |
| Project manager | `nisha@fieldwork.test` |
| Project manager | `kabir@fieldwork.test` |
| Developer       | `ravi@fieldwork.test`  |
| Developer       | `maya@fieldwork.test`  |
| Developer       | `arjun@fieldwork.test` |
| Developer       | `sara@fieldwork.test`  |

The seed creates three clients, three projects, 18 tasks across all workflow states, overdue work, activity history, and notifications. Seeding an already initialized database leaves existing user data intact.

### Run the complete stack in Docker

```bash
npm run setup
docker compose --profile full up --build -d
docker compose exec api node apps/api/dist/seed.js
```

Stop services without removing database data:

```bash
docker compose down
```

Running `docker compose down -v` also deletes the PostgreSQL volume and should be used only when a full local reset is intended.

## Environment variables

The setup script creates safe local values automatically. Deployment values belong in the hosting provider, never in source control.

| Variable             | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                 |
| `JWT_ACCESS_SECRET`  | Access-token signing secret                  |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret                 |
| `SEED_PASSWORD`      | Initial password for seeded demo accounts    |
| `WEB_ORIGIN`         | Allowed frontend origin for CORS and cookies |
| `COOKIE_SAME_SITE`   | Refresh-cookie cross-site policy             |
| `TRUST_PROXY`        | Trusted proxy count for the deployed API     |
| `JOBS_ENABLED`       | Enables scheduled overdue detection          |
| `VITE_API_URL`       | Public browser-facing API origin             |
| `VITE_SOCKET_URL`    | Public browser-facing Socket.IO origin       |

Never place a password, database URL, or signing secret in a `VITE_` variable; Vite includes those values in the browser bundle.

## Verification

### Static checks

```bash
npm run typecheck
npm run build
npm run format:check
```

### Integration and browser tests

Tests require a disposable PostgreSQL database whose name ends in `_test`. The guard prevents destructive test setup against a normal application database.

```bash
export NODE_ENV=test
export DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/agency_test'
npm test
npm run test:prepare
npx playwright install chromium
npm run test:e2e
```

The automated suite contains 12 backend integration tests and four end-to-end browser scenarios. It covers authorization boundaries, validation, token tampering and replay, session refresh, real WebSocket clients, presence, stale edits, reassignment, notifications, overdue jobs, archive/restore, filter persistence, mobile layout, and keyboard-accessible dialogs. GitHub Actions runs the full suite against PostgreSQL 17 on every push to `main` and on pull requests.

## Project structure

```text
apps/
├── api/
│   ├── migrations/       PostgreSQL schema and indexes
│   └── src/
│       ├── app.ts        Routes, middleware, and structured errors
│       ├── auth.ts       Sessions and token rotation
│       ├── repository.ts Scoped reads and shared queries
│       ├── services.ts   Transactional business operations
│       ├── realtime.ts   Private events and presence
│       └── index.ts      API lifecycle and scheduler
└── web/
    └── src/
        ├── pages/        Role-aware application screens
        ├── api.ts        Requests and refresh coordination
        ├── session.tsx   Auth, sockets, and reconnect catch-up
        ├── forms.tsx     Entity editors
        └── components.tsx Shared interface components
docs/
├── api.md
├── architecture.md
├── deployment.md
└── submission-explanation.md
```

## Deployment

The live application uses separate hosts for the concerns they handle best:

- **Vercel** builds and serves the React frontend.
- **Render** runs one persistent Dockerized API instance and PostgreSQL database.
- **GitHub Actions** verifies formatting, builds, integration tests, and browser tests before delivery.

The root `vercel.json`, `Dockerfile`, and `render.yaml` contain the deployment configuration. See [docs/deployment.md](docs/deployment.md) for environment variables, cookie configuration, seeding, and live verification.

The public demonstration currently uses free hosting. The Render API can sleep when idle, and the free PostgreSQL instance has a limited lifetime; these constraints are hosting-tier limitations rather than application behavior.

## Design boundaries

- One API process owns real-time presence and scheduled jobs. Horizontal scaling requires a shared Socket.IO adapter and distributed presence state.
- Due dates are whole UTC dates; incomplete tasks become overdue after the due date ends.
- Catch-up intentionally returns a bounded recent window rather than acting as an activity export.
- Password reset email, invitations, uploads, comments, and billing are outside the current product scope.
- Notifications display the most recent visible entries while unread counts remain authoritative.

## Documentation

- [Architecture and data model](docs/architecture.md)
- [API reference](docs/api.md)
- [Deployment guide](docs/deployment.md)
- [Engineering trade-off](docs/submission-explanation.md)
