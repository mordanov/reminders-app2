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

## Shared infrastructure

Production is registered in the sibling `web-folders` repository as
`https://reminders2.mainpage.ru`. The shared stack provides TLS, Basic Auth, routing,
and certificate renewal. It runs these services:

- `reminders2-db`: dedicated PostgreSQL 18 database, required because the shared
  `recipes-db` cluster currently runs PostgreSQL 16.
- `reminders2-backend`: API, migrations, user synchronization, purge scheduler, and
  SSE publisher.
- `reminders2-frontend`: nginx serving the compiled React single-page application.

Local deployment remains unchanged and continues to use this repository's
`docker-compose.yaml`.

Before the first production deployment, add real `REMINDERS2_*` values to
`/home/deploy/web-folders/.env`, then publish the backend and frontend images through
`.github/workflows/build-deploy.yml`. Start the services and issue the certificate:

```bash
cd /home/deploy/web-folders
docker compose pull reminders2-backend reminders2-frontend
docker compose up -d reminders2-db reminders2-backend reminders2-frontend nginx
docker compose exec certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos --no-eff-email \
  -d reminders2.mainpage.ru
docker compose up -d --force-recreate nginx
curl -fsS https://reminders2.mainpage.ru/openapi.json >/dev/null
```

The shared edge creates its Basic Auth file from the same two configured users and
passes `X-Authenticated-User` plus `X-Internal-Secret` to the backend. Keep the
frontend and backend `REMINDERS2_INTERNAL_AUTH_SECRET` values identical.
