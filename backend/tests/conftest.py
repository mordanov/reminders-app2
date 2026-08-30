from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["INTERNAL_AUTH_SECRET"] = "test-secret"

from app.config import Settings, get_settings  # noqa: E402
from app.db import Base, get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models import FloatingCategory, User  # noqa: E402
from app.passwords import PasswordHashService  # noqa: E402


class DummyBroker:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def publish(self, event: dict[str, object]) -> None:
        self.events.append(event)


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        password_service = PasswordHashService(rounds=4)
        session.add_all(
            [
                User(
                    username="alice",
                    password_hash=password_service.hash(SecretStr("fixture-alice")),
                    active=True,
                ),
                User(
                    username="bob",
                    password_hash=password_service.hash(SecretStr("fixture-bob")),
                    active=True,
                ),
                FloatingCategory(
                    owner_id=None,
                    name="Без категории",
                    position=0,
                    global_category=True,
                ),
            ]
        )
        await session.commit()
    yield factory
    await engine.dispose()


@pytest.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncClient]:
    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_settings] = lambda: Settings(
        database_url="sqlite+aiosqlite://",
        internal_auth_secret="test-secret",
        app_timezone="Europe/Madrid",
    )
    app.state.broker = DummyBroker()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
def alice_headers() -> dict[str, str]:
    return {
        "X-Authenticated-User": "alice",
        "X-Internal-Secret": "test-secret",
    }


@pytest.fixture
def bob_headers() -> dict[str, str]:
    return {
        "X-Authenticated-User": "bob",
        "X-Internal-Secret": "test-secret",
    }
