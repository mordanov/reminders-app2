from __future__ import annotations

import asyncio
import contextlib
import logging

from app.config import Settings
from app.db import SessionFactory
from app.services import purge_deleted

logger = logging.getLogger(__name__)


class PurgeScheduler:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self.task = asyncio.create_task(self._run(), name="deleted-content-purge")

    async def stop(self) -> None:
        if self.task is not None:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self.settings.purge_interval_seconds)
            try:
                async with SessionFactory() as session:
                    await purge_deleted(session, self.settings.deleted_retention_days)
            except Exception:
                logger.exception("scheduled purge failed; it will be retried")
