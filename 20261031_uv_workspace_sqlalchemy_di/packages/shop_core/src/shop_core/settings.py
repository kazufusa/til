"""接続設定。環境変数の名前と未設定時のエラーは基盤チームの規約"""

import os
from dataclasses import dataclass

_TRUE = {"1", "true", "yes"}


class SettingsError(RuntimeError):
    """必須の設定が足りないときのエラー"""


def _number(name, kind, default):
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return kind(raw)
    except ValueError:
        raise SettingsError(f"{name} must be a number: {raw!r}") from None


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    return default if not raw else raw in _TRUE


@dataclass(frozen=True)
class Settings:
    database_url: str
    echo: bool = False
    # 接続プール。既定値は SQLAlchemy のもの
    pool_size: int = 5
    max_overflow: int = 10
    pool_timeout: float = 30.0
    pool_recycle: int = -1  # 秒。-1 は再利用の期限なし
    pool_pre_ping: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise SettingsError("DATABASE_URL is not set")
        echo = os.environ.get("SQL_ECHO", "").strip().lower() in _TRUE
        d = cls.__dataclass_fields__
        return cls(
            database_url=database_url,
            echo=echo,
            pool_size=_number("DB_POOL_SIZE", int, d["pool_size"].default),
            max_overflow=_number("DB_MAX_OVERFLOW", int, d["max_overflow"].default),
            pool_timeout=_number("DB_POOL_TIMEOUT", float, d["pool_timeout"].default),
            pool_recycle=_number("DB_POOL_RECYCLE", int, d["pool_recycle"].default),
            pool_pre_ping=_flag("DB_POOL_PRE_PING", d["pool_pre_ping"].default),
        )
