from __future__ import annotations

import asyncio
import json

from app.config import Settings
from app.events import ChangeBroker
from app.scheduler import PurgeScheduler


async def test_local_change_broker_publish_and_subscribe() -> None:
    settings = Settings(database_url="sqlite+aiosqlite://")
    broker = ChangeBroker(settings)
    await broker.start()
    subscription = broker.subscribe()
    pending = asyncio.create_task(anext(subscription))
    await asyncio.sleep(0)
    await broker.publish({"type": "changed", "entity_id": "1"})
    payload = json.loads(await pending)
    assert payload["event"]["type"] == "changed"
    await subscription.aclose()
    await broker.stop()


async def test_scheduler_start_and_stop() -> None:
    scheduler = PurgeScheduler(Settings(database_url="sqlite+aiosqlite://"))
    scheduler.start()
    assert scheduler.task is not None
    await scheduler.stop()
