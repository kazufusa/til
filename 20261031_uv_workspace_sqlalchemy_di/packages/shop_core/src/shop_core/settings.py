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
    # 接続ごとの Postgres の上限(ミリ秒)。0 は無制限。超えると DependencyError
    # (db_statement_timeout / db_lock_timeout)
    statement_timeout_ms: int = 0
    lock_timeout_ms: int = 0
    # オブジェクトストレージ(S3)。バケット名は shop-{env}-artifacts が既定
    env: str = "local"
    artifact_bucket: str = "shop-local-artifacts"
    s3_endpoint_url: str | None = None  # ローカルでは MinIO を指す
    # 署名付き URL に使う公開側の endpoint。None なら s3_endpoint_url と同じ。
    # コンテナ内から見える名前(s3mock:9090)と、ブラウザから見える名前(localhost:9000)が違うときに使う
    s3_public_endpoint_url: str | None = None
    s3_region: str = "ap-northeast-1"

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise SettingsError("DATABASE_URL is not set")
        echo = os.environ.get("SQL_ECHO", "").strip().lower() in _TRUE
        d = cls.__dataclass_fields__
        env = os.environ.get("ENV", "").strip() or d["env"].default
        return cls(
            database_url=database_url,
            echo=echo,
            pool_size=_number("DB_POOL_SIZE", int, d["pool_size"].default),
            max_overflow=_number("DB_MAX_OVERFLOW", int, d["max_overflow"].default),
            pool_timeout=_number("DB_POOL_TIMEOUT", float, d["pool_timeout"].default),
            pool_recycle=_number("DB_POOL_RECYCLE", int, d["pool_recycle"].default),
            pool_pre_ping=_flag("DB_POOL_PRE_PING", d["pool_pre_ping"].default),
            statement_timeout_ms=_number(
                "DB_STATEMENT_TIMEOUT_MS", int, d["statement_timeout_ms"].default
            ),
            lock_timeout_ms=_number("DB_LOCK_TIMEOUT_MS", int, d["lock_timeout_ms"].default),
            env=env,
            artifact_bucket=os.environ.get("ARTIFACT_BUCKET", "").strip() or f"shop-{env}-artifacts",
            s3_endpoint_url=os.environ.get("S3_ENDPOINT_URL", "").strip() or None,
            s3_public_endpoint_url=os.environ.get("S3_PUBLIC_ENDPOINT_URL", "").strip() or None,
            s3_region=os.environ.get("AWS_REGION", "").strip() or d["s3_region"].default,
        )
