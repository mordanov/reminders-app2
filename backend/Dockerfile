FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
RUN python -m venv .venv
COPY pyproject.toml ./

FROM base AS test

COPY alembic.ini ./
COPY app ./app
COPY alembic ./alembic
COPY tests ./tests
RUN pip install --no-cache-dir ".[dev]"
CMD ["pytest"]

FROM base AS runtime

COPY alembic.ini ./
COPY app ./app
COPY alembic ./alembic
COPY startup.sh ./
RUN pip install --no-cache-dir . \
    && chmod +x startup.sh

EXPOSE 8000
CMD ["./startup.sh"]
