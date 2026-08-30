# Contributing

## Before starting

Read the [architecture](architecture.md) and [developer guide](development.md). Keep
changes focused, simple, and compatible with the established service/component
boundaries. Prefer existing helpers over duplication.

Never commit `.env`, credentials, generated Basic Auth files, database volumes,
`node_modules`, virtual environments, or coverage output.

## Setup

```bash
cp .env.example .env
pre-commit install
docker compose up --build
```

Install `pre-commit`, Python 3.14 backend dependencies, and Node.js 22 frontend
dependencies before using all local hooks.

## Change requirements

1. Add an Alembic migration for every persistent schema change.
2. Preserve owner/editor authorization and optimistic concurrency.
3. Add tests for behavior and failure paths.
4. Keep backend coverage at least 70% and every frontend coverage metric at least 90%.
5. Keep Russian and English translations synchronized.
6. Maintain keyboard operation, visible focus, dialog focus management, contrast, and
   reduced-motion behavior.
7. Update user and developer documentation for visible or operational changes.

## Required checks

```bash
pre-commit run --all-files
docker compose --profile lint run --build --rm backend-lint
docker compose --profile lint run --build --rm frontend-lint
docker compose --profile coverage run --build --rm backend-coverage
docker compose --profile coverage run --build --rm frontend-coverage
docker compose build backend nginx
```

Use a clear pull request description with the motivation, behavioral changes, migration
impact, screenshots for UI changes, and commands run. Do not lower thresholds, narrow
coverage inclusion, or suppress type/lint errors to make checks pass.

## Design assets

Do not replace extracted botanical artwork with external or generated images. If the
source layout changes, update crop bounds in `scripts/extract_assets.py`, regenerate the
assets, and copy the required output into `frontend/public/assets`.
