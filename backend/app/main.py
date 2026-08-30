from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm.exc import StaleDataError

from app.api import router
from app.config import get_settings
from app.db import SessionFactory
from app.events import ChangeBroker
from app.scheduler import PurgeScheduler
from app.services import sync_configured_users


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    async with SessionFactory() as session:
        await sync_configured_users(session, settings.configured_users)
    broker = ChangeBroker(settings)
    await broker.start()
    scheduler = PurgeScheduler(settings)
    scheduler.start()
    app.state.broker = broker
    try:
        yield
    finally:
        await scheduler.stop()
        await broker.stop()


settings = get_settings()
app = FastAPI(
    title="Reminders API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


@app.exception_handler(StaleDataError)
async def stale_data_handler(_request: Request, _error: StaleDataError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "stale resource version"},
    )


if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.include_router(router)
