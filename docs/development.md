# Developer guide

## Repository layout

```text
backend/          FastAPI application, tests, Alembic, Python image
frontend/         React/Vite application, tests, frontend build image
nginx/            reverse proxy, Basic Auth bootstrap, production image
docs/             user, architecture, contributor, and operations docs
docker-compose.yaml
```

The root `index.html`, `styles.css`, extracted `image_*.png` files, and
`scripts/extract_assets.py` preserve the original design source. Runtime frontend assets
live under `frontend/public/assets`.

## Configuration

Copy `.env.example` to `.env`. Required values are database credentials, two distinct
username/password pairs, and a long random internal secret. Passwords are hashed during
user synchronization and never stored in plaintext. A changed password is synchronized
on restart without changing user-owned data.

`APP_TIMEZONE`, retention, and purge interval are configurable. Passwords containing
characters with special meaning in PostgreSQL URLs must be URL-safe for the current
Compose connection string.

## Production-style local workflow

This project intentionally does not mount source code or enable hot reload. Rebuild
after changes:

```bash
docker compose up --build
docker compose up --build -d
docker compose logs -f backend nginx
docker compose down
```

The backend entrypoint runs `alembic upgrade head` before Uvicorn. nginx is started only
after the backend health check passes.

## Native backend workflow

Python 3.14 and `uv` are recommended:

```bash
cd backend
uv sync --python 3.14 --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app
uv run ruff check app tests alembic
uv run ruff format --check app tests alembic
uv run mypy app
uv run pytest
```

Provide `DATABASE_URL`, configured users, and the internal secret. Set
`TEST_POSTGRES_URL` to a disposable PostgreSQL 18 database to include the integration
test; otherwise that one test is skipped.

## Native frontend workflow

Use Node.js 22.12 or newer:

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
```

Vite's demo data is used only in development unless `VITE_LIVE_API=true`. The
production build always uses same-origin `/api`.

## API and migrations

The machine-readable OpenAPI document is served at `/openapi.json`; interactive Swagger
and ReDoc are disabled. Add schema changes as new Alembic revisions:

```bash
cd backend
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
uv run alembic downgrade -1
```

Review generated migrations manually, including downgrade behavior and indexes.

## Testing strategy

Backend tests cover services, secured API behavior, events, concurrency, and PostgreSQL
18 connectivity. The enforced threshold is 70% across the complete `app` package.

Frontend tests use Vitest, Testing Library, jsdom, and V8 coverage. They cover all
production modules rather than a selected subset. Statements, branches, functions, and
lines must each remain at or above 90%.

Use focused tests while iterating, then run every lint, type, test, coverage, and build
gate before submitting a change.
