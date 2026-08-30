from __future__ import annotations

import hashlib

import bcrypt
from pydantic import SecretStr


class PasswordHashService:
    def __init__(self, rounds: int = 12) -> None:
        self.rounds = rounds

    @staticmethod
    def _prehash(password: SecretStr) -> bytes:
        return hashlib.sha256(password.get_secret_value().encode()).digest()

    def hash(self, password: SecretStr) -> str:
        return bcrypt.hashpw(self._prehash(password), bcrypt.gensalt(rounds=self.rounds)).decode()

    def needs_update(self, password: SecretStr, password_hash: str | None) -> bool:
        if password_hash is None:
            return True
        try:
            encoded = password_hash.encode()
            if not bcrypt.checkpw(self._prehash(password), encoded):
                return True
            parts = password_hash.split("$")
            return len(parts) < 3 or int(parts[2]) != self.rounds
        except ValueError:
            return True

    def verify(self, password: SecretStr, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(self._prehash(password), password_hash.encode())
        except ValueError:
            return False


password_hash_service = PasswordHashService()
