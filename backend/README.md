# Reminders backend

FastAPI service for the multi-user reminders application. Nginx owns Basic Auth; every
non-public API request must include the authenticated username and the shared internal
secret in `X-Authenticated-User` and `X-Internal-Secret`.

At startup, the two `.env` username/password pairs are synchronized to PostgreSQL.
Passwords are stored only as bcrypt hashes and are re-hashed whenever a configured
password changes. Nginx remains the authentication boundary; hashes are never returned
by the API.

## Run

```sh
cp .env.example .env
alembic upgrade head
uvicorn app.main:app
```

`/openapi.json` is public; interactive documentation is disabled. The application syncs
the two configured users at startup, creates their first private `Личный` calendar, starts
the 30-day purge scheduler, and connects the SSE broker to PostgreSQL `LISTEN/NOTIFY`.

## Quality

```sh
pytest
ruff check app tests alembic
ruff format --check app tests alembic
mypy app
```

Set `TEST_POSTGRES_URL` to a disposable PostgreSQL database when running PostgreSQL
integration tests. The default test suite uses SQLite only for fast isolated execution.
