from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

import asyncpg

from app.config import Settings

CHANNEL = "reminders_changes"
logger = logging.getLogger(__name__)


class ChangeBroker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.instance_id = str(uuid.uuid4())
        self.subscribers: set[asyncio.Queue[str]] = set()
        self.connection: asyncpg.Connection | None = None
        self.publish_lock = asyncio.Lock()

    async def start(self) -> None:
        if not self.settings.database_url.startswith("postgresql"):
            return
        await self._connect()

    async def _connect(self) -> None:
        self.connection = await asyncpg.connect(self.settings.asyncpg_dsn(), timeout=2)
        await self.connection.add_listener(CHANNEL, self._receive)

    async def _disconnect(self) -> None:
        if self.connection is not None:
            with contextlib.suppress(asyncpg.PostgresError, OSError):
                await self.connection.remove_listener(CHANNEL, self._receive)
                await self.connection.close()
            self.connection = None

    async def stop(self) -> None:
        await self._disconnect()

    def _receive(
        self, _connection: asyncpg.Connection, _pid: int, _channel: str, payload: str
    ) -> None:
        try:
            envelope = json.loads(payload)
        except json.JSONDecodeError:
            return
        if envelope.get("source") != self.instance_id:
            self._broadcast(payload)

    def _broadcast(self, payload: str) -> None:
        for queue in tuple(self.subscribers):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(payload)

    async def publish(self, event: dict[str, Any]) -> None:
        envelope = json.dumps(
            {"source": self.instance_id, "event": event},
            separators=(",", ":"),
            default=str,
        )
        self._broadcast(envelope)
        if not self.settings.database_url.startswith("postgresql"):
            return
        async with self.publish_lock:
            try:
                if self.connection is None or self.connection.is_closed():
                    await self._connect()
                assert self.connection is not None
                await self.connection.execute("SELECT pg_notify($1, $2)", CHANNEL, envelope)
            except asyncpg.PostgresError, OSError, TimeoutError:
                logger.exception("Failed to publish change notification; clients will reconnect")
                await self._disconnect()

    async def subscribe(self) -> AsyncIterator[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self.subscribers.add(queue)
        try:
            while True:
                try:
                    yield await asyncio.wait_for(queue.get(), timeout=20)
                except TimeoutError:
                    yield json.dumps({"event": {"type": "keepalive"}})
        finally:
            self.subscribers.discard(queue)
