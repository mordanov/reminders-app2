from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True, slots=True)
class ConfiguredUser:
    username: str
    password: SecretStr


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    database_url: str = "postgresql+asyncpg://reminders:reminders@localhost/reminders"
    app_timezone: str = "Europe/Madrid"
    internal_auth_secret: SecretStr = SecretStr("development-only-change-me")
    auth_user_1_username: str | None = None
    auth_user_1_password: SecretStr | None = None
    auth_user_2_username: str | None = None
    auth_user_2_password: SecretStr | None = None
    cors_origins: list[str] = Field(default_factory=list)
    purge_interval_seconds: int = 3600
    deleted_retention_days: int = 30
    sql_echo: bool = False

    @field_validator("purge_interval_seconds")
    @classmethod
    def validate_purge_interval(cls, value: int) -> int:
        if value < 60:
            raise ValueError("purge interval must be at least 60 seconds")
        return value

    @property
    def configured_users(self) -> tuple[ConfiguredUser, ...]:
        pairs: list[tuple[str | None, SecretStr | None]] = [
            (self.auth_user_1_username, self.auth_user_1_password),
            (self.auth_user_2_username, self.auth_user_2_password),
        ]
        configured: list[ConfiguredUser] = []
        for username, password in pairs:
            if bool(username) != bool(password):
                raise ValueError("each configured user needs both username and password")
            if username and password:
                normalized = username.strip()
                if not normalized:
                    raise ValueError("usernames cannot be blank")
                configured.append(ConfiguredUser(username=normalized, password=password))
        usernames = [user.username for user in configured]
        if len(set(usernames)) != len(usernames):
            raise ValueError("configured usernames must be unique")
        if configured and len(configured) != 2:
            raise ValueError("exactly two users must be configured")
        return tuple(configured)

    @property
    def configured_usernames(self) -> tuple[str, ...]:
        return tuple(user.username for user in self.configured_users)

    def asyncpg_dsn(self) -> str:
        return self.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    @classmethod
    def from_overrides(cls, **kwargs: Any) -> Settings:
        return cls(**kwargs)


@lru_cache
def get_settings() -> Settings:
    return Settings()
