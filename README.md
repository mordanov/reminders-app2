# Reminders

A collaborative weekly reminder application with a vintage paper interface. It supports
two environment-configured users, private and shared calendars, date-only and timed
reminders, personal floating-task categories, and live updates.

## Quick start

Requirements:

- Docker with Compose v2 (`docker compose` or `docker-compose`)
- `make` is optional; every command is documented without it

```bash
cp .env.example .env
# Replace every change-this value in .env.
docker compose up --build
```

If your installation provides the standalone binary, replace `docker compose` with
`docker-compose`. Open <http://localhost:8080> and enter either configured Basic Auth
credential pair. The public OpenAPI contract is at
<http://localhost:8080/openapi.json>.

PostgreSQL data is stored in the named `postgres_data` volume. Startup automatically
runs Alembic migrations and synchronizes configured users. An existing user removed
from `.env` is disabled without deleting data; restoring that username re-enables it.

## Quality commands

```bash
docker compose --profile lint run --build --rm backend-lint
docker compose --profile lint run --build --rm frontend-lint
docker compose --profile test run --build --rm backend-test
docker compose --profile test run --build --rm frontend-test
docker compose --profile coverage run --build --rm backend-coverage
docker compose --profile coverage run --build --rm frontend-coverage
```

Coverage fails below 70% for the backend or 90% for the frontend.

## Documentation

- [User guide](docs/user-guide.md)
- [Developer guide](docs/development.md)
- [Architecture](docs/architecture.md)
- [Contributing](docs/contributing.md)
- [Operations](docs/operations.md)

The application UI supports Russian and English. Project documentation is English.

Production deployment through the shared `web-folders` infrastructure is documented
in [Operations](docs/operations.md#shared-infrastructure).
