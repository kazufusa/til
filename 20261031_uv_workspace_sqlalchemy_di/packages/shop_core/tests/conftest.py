import os
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from dependency_injector import providers
from sqlalchemy import create_engine, text

from shop_core import Container, Settings
from shop_core.infra.orm import Base

_ROOT = Path(__file__).resolve().parents[1]


def reset_schema(url: str) -> None:
    """shop スキーマを作り直す。テーブル、ビュー、alembic_version がすべて消える"""
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("drop schema if exists app_test cascade"))
        conn.execute(text("drop schema if exists shop cascade"))
    engine.dispose()


def migrate_to_head(url: str) -> None:
    """空のスキーマに alembic upgrade head を当てる。ビューは metadata にないので create_all では作れない"""
    reset_schema(url)
    cfg = Config(str(_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_ROOT / "migrations"))
    old = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    try:
        command.upgrade(cfg, "head")
    finally:
        if old is None:
            del os.environ["DATABASE_URL"]
        else:
            os.environ["DATABASE_URL"] = old


@pytest.fixture
def pg_url():
    """TEST_DATABASE_URL の DB を、テストの前後で空にする"""
    url = os.environ["TEST_DATABASE_URL"]
    reset_schema(url)
    yield url
    reset_schema(url)


@pytest.fixture
def pg_container(pg_url):
    """テーブルだけ create_all で作った Container。ビューが要るときは migrate_to_head を使う"""
    c = Container(settings=providers.Object(Settings(database_url=pg_url)))
    with c.engine().begin() as conn:
        conn.execute(text("create schema if not exists shop"))
    Base.metadata.create_all(c.engine())
    yield c
    c.engine().dispose()
