# Operations

## Lifecycle

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f backend nginx db
docker compose down
```

Changing either Basic Auth password requires recreating the backend and nginx
containers so the password hash and `.htpasswd` file are synchronized:

```bash
docker compose up --build -d --force-recreate backend nginx
```

## Backup and restore

Create a compressed logical backup:

```bash
docker compose exec -T db pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > reminders.dump
```

Restore into an empty target database after stopping application writes:

```bash
cat reminders.dump | docker compose exec -T db pg_restore \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists
```

Test restore procedures regularly. Backup files contain user content and must be
protected like production data.

## Reset local data

This permanently removes the local database:

```bash
docker compose down --volumes
```

The next `up` creates a clean PostgreSQL volume, runs migrations, synchronizes the two
configured users, and creates their default calendars.

## Retention and audit

User deletion actions are soft deletes. The in-process scheduler permanently purges
records after `DELETED_RETENTION_DAYS` (30 by default), checking every
`PURGE_INTERVAL_SECONDS`. The audit log is internal and has no user-facing endpoint.

## Security notes

- Local `http://localhost:8080` sends Basic Auth without TLS. Use it only on a trusted
  local machine.
- Production deployments must use HTTPS, secret management, restricted network
  policies, database backups, and rotated credentials.
- Never expose port 8000 publicly. The backend trusts identity only when nginx includes
  the matching internal secret.
- `/openapi.json` is intentionally public and contains the API shape but no user data.
