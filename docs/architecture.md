# Architecture

## Runtime topology

```text
Browser
  |
  | HTTP :8080 + Basic Auth
  v
nginx (React assets, authentication, reverse proxy)
  |
  | private Compose network
  | X-Authenticated-User + X-Internal-Secret
  v
FastAPI / SQLAlchemy async
  |
  v
PostgreSQL 18
```

nginx serves the production Vite build and proxies `/api/*`. It authenticates every
application route, while `/openapi.json` is intentionally public. The backend is not
published to the host. It accepts identity headers only when accompanied by the
constant-time-checked internal secret. SSE uses the same authenticated origin and has
proxy buffering disabled.

For non-local deployment, terminate TLS before Basic Auth, rotate all example secrets,
restrict database access, and manage secrets outside plain Compose environment files.

## Backend boundaries

- **API routes** validate transport schemas and permissions.
- **Services** centralize calendar access, tag movement, date/time rules, user sync,
  auditing, and retention.
- **Models** enforce relationships, optimistic versions, and soft deletion.
- **Change broker** uses PostgreSQL `LISTEN/NOTIFY` and feeds authenticated SSE clients.
- **Purge scheduler** permanently removes records after the configured 30-day
  retention window.

All stored instants are timezone-aware. `APP_TIMEZONE` defaults to `Europe/Madrid` and
drives workday validation and display expectations. The product intentionally supports
Monday through Saturday only.

## Core data model

- `users`: configured identity, active state, password hash, preferences
- `calendars`: owner, unique owner/name pair, palette color, optimistic version
- `calendar_members`: editor access
- `reminders`: DAY or DATETIME assignment, completion, position/version, soft delete
- `tags` and `reminder_tags`: calendar-scoped labels
- `floating_categories`: personal category and order
- `floating_tasks`: shared calendar content assigned to a user's category
- `audit_logs`: internal immutable action history

Weekly multiplication writes independent reminder rows in one transaction. There is no
recurrence series. Shared editors have full content permissions; calendar metadata and
membership remain owner-only.

## Frontend boundaries

React Router owns bookmarkable week URLs. TanStack Query owns server state and is
invalidated by SSE events. Typed API functions isolate HTTP details; feature components
own dialogs, week rendering, calendars, and floating tasks. i18next supplies Russian
and English UI/date locale behavior. Drag-and-drop always has button/keyboard
alternatives.

## Concurrency and deletion

Mutable resources carry a version. SQLAlchemy optimistic concurrency rejects stale
writes with HTTP 409 rather than silently applying last-write-wins. User-visible delete
operations set `deleted_at`; calendar deletion cascades that state to dependent content.
The scheduler later performs physical deletion.
