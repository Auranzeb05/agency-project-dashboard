# Deployment

The frontend is configured for Vercel. The API needs a continuously running Node.js process and PostgreSQL. The optional Render blueprint creates both backend services, but provisioning is a separate account action and may incur charges.

## 1. Backend and database

Connect the repository to a container host, build the root `Dockerfile`, and expose its `PORT` (default 4000). Run exactly one API instance. The container applies SQL migrations before starting. Its health endpoint is `/api/health`.

Configure these server-only variables:

| Variable             | Value                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | Provider PostgreSQL connection string, with its required TLS configuration                 |
| `JWT_ACCESS_SECRET`  | Independently generated random secret, at least 32 characters                              |
| `JWT_REFRESH_SECRET` | Another independently generated random secret                                              |
| `SEED_PASSWORD`      | Strong password for this deployment's demo accounts                                        |
| `WEB_ORIGIN`         | Exact frontend origin, without a trailing slash; comma-separated if necessary              |
| `NODE_ENV`           | `production`                                                                               |
| `COOKIE_SAME_SITE`   | `lax` for same-site HTTPS subdomains; `none` if the origins are cross-site                 |
| `TRUST_PROXY`        | Number of trusted proxies in your actual host path; commonly `1`, verify with the provider |
| `JOBS_ENABLED`       | `true`                                                                                     |
| `OVERDUE_CRON`       | `* * * * *`                                                                                |

Run `node apps/api/dist/seed.js` once in the API container's shell after migrations finish. Seeding is explicit so deployment does not unexpectedly create demo accounts in an existing database.

The Render blueprint includes paid plan selections to keep the API available for sockets and scheduled work. Review the provider's displayed prices before accepting it. It sets a private database connection and generates separate token secrets; frontend origin and seed password remain required inputs.

## 2. Vercel frontend

Import the repository into Vercel. Keep the **repository root** as Root Directory: the root `vercel.json` builds the web workspace and serves `apps/web/dist`.

Set these public build variables:

- `VITE_API_URL=https://your-api-host`
- `VITE_SOCKET_URL=https://your-api-host`

Redeploy after changing either value. Never put secrets in `VITE_` variables; they are included in the browser bundle. Add the resulting exact Vercel origin to the API's `WEB_ORIGIN` and restart the API.

## Cookie arrangement

For a dependable browser experience, use HTTPS subdomains of the same site, such as `app.example.com` and `api.example.com`, with `COOKIE_SAME_SITE=lax`. Cross-site default provider domains require `SameSite=None; Secure`, and some browsers block third-party cookies regardless of that setting. If using those domains for evaluation, verify refresh after a full page reload in the evaluator's browser; a same-site domain arrangement avoids that class of problem.

A frontend-only Vercel deployment without the API URL, database, and scheduler is incomplete. Vercel currently documents [WebSocket support in beta](https://vercel.com/docs/functions/websockets), including reconnect and shared-state requirements. This application's selected architecture uses a persistent backend instead of relying on a function instance's lifetime. An all-Vercel adaptation would need shared presence/pub-sub and a separate durable scheduler arrangement; it is not represented by this repository's frontend deployment config.

## Verify the live application

1. Check `/api/health` on the backend and sign in through the Vercel frontend.
2. Refresh the page and confirm the HttpOnly refresh-cookie flow succeeds.
3. Open different browser profiles for Admin, Nisha, and Ravi. Change one of Ravi's task statuses and confirm the other permitted views update.
4. Open Kabir and Maya separately; confirm neither receives unauthorized task data.
5. Disconnect Ravi, make authorized changes, reconnect, and inspect the recovered activity.
6. Create an incomplete task with yesterday's UTC due date. Let the next scheduler tick flag it, without visiting that task first.
7. Verify mobile navigation, shared filter URLs, unread counts, and sign-out.

Make the repository public before submission, as requested by the assessment. Provide the Vercel URL and demo account credentials privately through the submission channel, not as committed secrets. Review `docs/submission-explanation.md` against the final deployed behavior before submitting.
