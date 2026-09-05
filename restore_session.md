# Session Restore Checkpoint

Updated: 2026-09-01

## Repository state

- Application repository: `reminders2-app`
- Application branch: `main`
- Application commit: `ebb62ab shared infra`
- Shared infrastructure repository: `../web-folders`
- Infrastructure branch: `main`
- Infrastructure commit: `19b91e8 shared infra`
- Both worktrees were clean when this checkpoint was created.
- All 22 tracked session todos were complete.

## Application summary

The repository contains a complete collaborative weekly reminders application:

- React 19, TypeScript, Vite, TanStack Query, i18next, Radix Dialog, and dnd-kit.
- FastAPI on Python 3.14 with async SQLAlchemy, asyncpg, Pydantic, and Alembic.
- PostgreSQL 18.
- nginx serving the frontend, enforcing HTTP Basic Auth, and proxying REST and SSE.
- Local Docker Compose deployment with lint, test, and coverage profiles.
- Russian and English UI.
- Two users configured through environment variables.
- Private and shared calendars.
- Date-only and exact-time reminders.
- Weekly reminder multiplication.
- Manually ordered date-only reminders and floating tasks.
- Personal categories with calendar-scoped shared tasks.
- Optimistic concurrency and stale-write rejection.
- PostgreSQL `LISTEN/NOTIFY` server-sent events.
- Soft deletion, 30-day purge, and internal audit records.

The visual design uses assets extracted from `reminders_landing.png`. The original
static prototype remains in root `index.html` and `styles.css`; the production
application is under `frontend/`.

## Important product rules

- Users are configured in `.env`; the current model supports exactly two users.
- Authentication occurs at nginx.
- nginx passes `X-Authenticated-User` and `X-Internal-Secret`.
- The backend accepts identity only when the internal secret matches.
- Users may own at most 10 calendars; shared calendars do not count.
- Calendar owners manage metadata, sharing, and deletion.
- Shared users may edit reminders and floating tasks.
- Sunday reminders are forbidden.
- Date-only reminders use `due_date` and no `due_at`.
- Timed reminders use timezone-aware `due_at` and no `due_date`.
- Application timezone defaults to `Europe/Madrid`.
- Weekly copies preserve local wall-clock time across DST transitions.
- Weekly count is 1-52 and includes the original reminder.
- Duplicate reminders produce a warning but may be confirmed.
- Floating-task categories are personal; tasks belong to calendars.
- Reordering floating tasks is restricted to each calendar/category group.
- Deletes and reorder requests include versions and return HTTP 409 when stale.

## Recent fixes

### Reminder calendar selection

The add/edit reminder dialog now receives every calendar accessible to the current
user, with currently selected calendars listed first. It initializes to a valid
calendar even when no calendars are selected for display.

The frontend also:

- Blocks submission if `calendar_id` is empty or inaccessible.
- Disables reminder creation only when the user has no accessible calendars.
- Prevents `/api/reminders` requests containing `calendar_id: ""`.
- Shows localized "Select a calendar first" feedback.

### Floating-task consistency

`CategoryPanel.tsx` now:

- Captures optimistic versions when editing begins.
- Prevents stale drafts from submitting with newer SSE-refreshed versions.
- Synchronizes category names only while the local field is not dirty.
- Displays and sorts tasks in separate groups per calendar.
- Disables task dragging while search filtering is active.

### Backend consistency

The backend now:

- Removes deleted or unshared calendar IDs from user preferences.
- Sanitizes inaccessible IDs when preferences are read.
- Returns HTTP 409 for duplicate active category names.
- Uses active-row partial unique indexes for soft-deleted names.
- Treats post-commit SSE notification failures as non-fatal.

### Frontend test stability

The large `App.test.tsx` navigation test uses direct DOM events for routine
interactions instead of many slower `userEvent` operations. The reminder editing test
waits for the actual edit buttons instead of only waiting for planner articles. The
App test passed five consecutive stress runs after this change.

## Shared infrastructure onboarding

Production domain:

```text
reminders2.mainpage.ru
```

The application is registered in `../web-folders` with:

- `reminders2-db`
- `reminders2-backend`
- `reminders2-frontend`

The shared database cluster is PostgreSQL 16, so this application intentionally keeps
a dedicated `postgres:18-alpine` service and volume named
`reminders2_postgres_data`.

Shared nginx:

- Terminates HTTP/TLS.
- Generates a two-user Basic Auth file from `REMINDERS2_AUTH_USER_*`.
- Leaves `/openapi.json` public.
- Proxies `/api/` without rewriting the prefix.
- Configures `/api/events` for unbuffered, long-lived SSE.
- Passes authenticated username and the rendered internal secret.
- Supports ACME HTTP challenges and automatic HTTPS template activation.

Relevant infrastructure files:

- `../web-folders/sites.yaml`
- `../web-folders/docker-compose.yaml`
- `../web-folders/.env.example`
- `../web-folders/nginx/start.sh`
- `../web-folders/nginx/templates/reminders2-http.conf.template`
- `../web-folders/nginx/templates/reminders2-http-redirect.conf.template`
- `../web-folders/nginx/templates/reminders2-https.conf.template`
- `../web-folders/ci-workflow-templates/reminders2-app.yml`

Application deployment files:

- `.github/workflows/build-deploy.yml`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `docs/operations.md`

The build workflow publishes:

- `ghcr.io/mordanov/reminders2-backend:latest`
- `ghcr.io/mordanov/reminders2-frontend:latest`

The deploy job is bootstrap-safe: it publishes images even if the shared
infrastructure services are not registered or the dedicated database is not running.

## Production environment variables

Real values must exist in `/home/deploy/web-folders/.env`:

```dotenv
REMINDERS2_PRIMARY_DOMAIN=reminders2.mainpage.ru
REMINDERS2_SERVER_NAMES=reminders2.mainpage.ru

REMINDERS2_POSTGRES_DB=reminders2
REMINDERS2_POSTGRES_USER=reminders2_user
REMINDERS2_POSTGRES_PASSWORD=<strong-random-password>

REMINDERS2_AUTH_USER_1_USERNAME=<username>
REMINDERS2_AUTH_USER_1_PASSWORD=<password>
REMINDERS2_AUTH_USER_2_USERNAME=<username>
REMINDERS2_AUTH_USER_2_PASSWORD=<password>
REMINDERS2_INTERNAL_AUTH_SECRET=<random-64-hex-secret>

REMINDERS2_APP_TIMEZONE=Europe/Madrid
REMINDERS2_PURGE_INTERVAL_SECONDS=3600
REMINDERS2_DELETED_RETENTION_DAYS=30
```

The same Basic Auth usernames/passwords are supplied to nginx and the backend. The
same internal secret must be supplied to shared nginx and the backend.

## Deployment continuation

If production has not yet been deployed:

1. Add real `REMINDERS2_*` values to `/home/deploy/web-folders/.env`.
2. Ensure both repositories and their current commits are pushed.
3. Run the application Build & Deploy workflow so GHCR images exist.
4. Deploy `web-folders` so the services and nginx templates are registered.
5. Start the application services:

   ```bash
   cd /home/deploy/web-folders
   docker compose pull reminders2-backend reminders2-frontend
   docker compose up -d reminders2-db reminders2-backend reminders2-frontend nginx
   ```

6. Issue the certificate:

   ```bash
   docker compose exec certbot certbot certonly \
     --webroot -w /var/www/certbot \
     --email "$LETSENCRYPT_EMAIL" \
     --agree-tos --no-eff-email \
     -d reminders2.mainpage.ru
   ```

7. Recreate nginx so HTTPS templates are rendered immediately:

   ```bash
   docker compose up -d --force-recreate nginx
   ```

8. Verify:

   ```bash
   curl -fsS https://reminders2.mainpage.ru/openapi.json >/dev/null
   curl -u '<username>:<password>' \
     -fsS https://reminders2.mainpage.ru/api/health
   docker compose ps reminders2-db reminders2-backend reminders2-frontend nginx
   ```

## Local operation

Local deployment remains independent of shared infrastructure:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8080`.

Be careful with an existing local `postgres_data` volume: changing
`POSTGRES_USER`/`POSTGRES_PASSWORD` in `.env` does not reinitialize an existing
PostgreSQL volume. Use the original credentials or intentionally reset the volume.

## Validation status

Latest validated results:

- Backend: 13 native tests passed, 1 PostgreSQL-only test skipped locally.
- Backend coverage: approximately 89%, threshold 70%.
- Container backend suite: 14 tests passed including PostgreSQL integration.
- Frontend: 39 tests passed.
- Frontend coverage:
  - Statements: approximately 98%.
  - Branches: approximately 94%.
  - Functions: approximately 93%.
  - Lines: approximately 98%.
- Frontend lint and TypeScript checks passed.
- Production frontend image and SPA fallback passed.
- Local Compose deployment passed in an isolated Compose project.
- Shared deployment passed end-to-end with PostgreSQL 18, Alembic head, frontend,
  both Basic Auth users, trusted proxy headers, and public OpenAPI.
- Temporary containers and networks were removed.
- The original local `reminders2-app_postgres_data` volume was preserved.

## MCP configuration

The repository `.mcp.json` registers:

```json
{
  "mcpServers": {
    "vps-docker": {
      "type": "stdio",
      "command": "uv",
      "args": [
        "--directory",
        "/Users/aleksandr/Local/vps_mcp",
        "run",
        "vps-docker-mcp"
      ]
    }
  }
}
```

## Documentation index

- `README.md`
- `docs/user-guide.md`
- `docs/development.md`
- `docs/architecture.md`
- `docs/contributing.md`
- `docs/operations.md`
- `../web-folders/documentation/onboarding.md`
