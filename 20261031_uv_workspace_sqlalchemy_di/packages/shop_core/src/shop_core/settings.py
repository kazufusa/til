"""接続設定。環境変数の名前と未設定時のエラーは基盤チームの規約"""

import os
from dataclasses import dataclass

_TRUE = {"1", "true", "yes"}


class SettingsError(RuntimeError):
    """必須の設定が足りないときのエラー"""


@dataclass(frozen=True)
class Settings:
    database_url: str
    echo: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise SettingsError("DATABASE_URL is not set")
        echo = os.environ.get("SQL_ECHO", "").strip().lower() in _TRUE
        return cls(database_url=database_url, echo=echo)
