# API reference

All routes are prefixed with `/api`. Protected requests require `Authorization: Bearer <accessToken>` and use the current database role. JSON inputs are validated with Zod. Lists use `{ "items": [...] }` unless noted.

| Method | Path                      | Access / behavior                                                              |
| ------ | ------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/health`                 | Database health, unauthenticated                                               |
| POST   | `/auth/login`             | Email/password; returns user/access token and sets refresh cookie              |
| POST   | `/auth/refresh`           | Rotates cookie; returns user/access token                                      |
| POST   | `/auth/logout`            | Revokes session; clears cookie                                                 |
| GET    | `/auth/me`                | Current authenticated identity                                                 |
| GET    | `/dashboard`              | Role-scoped totals, priorities, projects, weekly due dates; Admin online count |
| GET    | `/projects`               | Visible project summaries                                                      |
| POST   | `/projects`               | Admin/PM; `name`, `description`, `client_id`                                   |
| PATCH  | `/projects/:id`           | Admin/owning PM; project fields or `archived`                                  |
| GET    | `/tasks`                  | Scoped list and filters; `{items,total,page,limit}`                            |
| GET    | `/tasks/:id`              | Scoped task detail                                                             |
| POST   | `/projects/:id/tasks`     | Admin/owning PM; task creation                                                 |
| PATCH  | `/tasks/:id`              | Admin/owning PM; editable task fields and current `version`                    |
| PATCH  | `/tasks/:id/status`       | Admin/owning PM/assigned Developer; `status`, `version`                        |
| GET    | `/activity`               | Scoped latest 20 events; `{items,cursor}`                                      |
| GET    | `/notifications`          | Current user's visible notifications; `{items,unread}`                         |
| PATCH  | `/notifications/:id/read` | Current user's notification only                                               |
| PATCH  | `/notifications/read-all` | Current user's visible notifications                                           |
| GET    | `/clients`                | Admin full list; PM selection directory                                        |
| POST   | `/clients`                | Admin; `name`, `email`, `company`                                              |
| PUT    | `/clients/:id`            | Admin; update client fields                                                    |
| GET    | `/users`                  | Admin full directory; PM active developer names/IDs                            |
| POST   | `/users`                  | Admin; `name`, `email`, `role`, `password`                                     |
| PATCH  | `/users/:id`              | Admin; account fields, optional new password, active status                    |

Task input: `title`, `description`, `assigned_to`, `status`, `priority`, and `due_date` (`YYYY-MM-DD`). Status defaults to `TODO`, priority to `MEDIUM`. Editing requires the task's current integer `version`; version mismatch returns 409. A developer can use only the status endpoint.

Task filters: `project_id`, `status`, `priority`, `due_from`, `due_to`, `page` (default 1), and `limit` (default 30, maximum 100). Dates are inclusive. Default sort is priority descending, due date ascending, then ID. Activity filters: `project_id`, `task_id`, and `after` (an activity ID as a decimal string).

Cookie-authenticated POSTs need an allowed Origin and `X-Requested-With: Fieldwork`. Refresh/logout and notification read actions accept an empty JSON object.

## Error envelope

```json
{
  "error": {
    "code": "STALE_TASK",
    "message": "This task changed while you were editing it. Reload it and try again.",
    "requestId": "request identifier"
  }
}
```

Validation errors additionally include a `details` array with field/message pairs. Stack traces stay on the server. Relevant statuses: 400 invalid input/reference, 401 unauthenticated, 403 role/origin denied, 404 missing or inaccessible resource, 409 conflict, 413 oversized body, 429 rate limited, 500 unexpected error.

## Socket events

Connect to `/socket.io` with `transports: ['websocket']` and `auth: {token: accessToken}`. The connection also needs an allowed Origin. No client-controlled room subscriptions are exposed.

| Event           | Payload    | Recipient                                           |
| --------------- | ---------- | --------------------------------------------------- |
| `ready`         | none       | Authenticated connecting user; initiate DB catch-up |
| `activity`      | `{taskId}` | Current authorized task audience                    |
| `notifications` | `{unread}` | Affected user's private room                        |
| `presence`      | `{count}`  | Administrators only                                 |
| `invalidate`    | none       | Affected or connected users; refresh scoped views   |
