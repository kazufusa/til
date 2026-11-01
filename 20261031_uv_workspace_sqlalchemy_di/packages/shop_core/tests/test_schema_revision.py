"""check_database がスキーマの版をライブラリの head と突き合わせる"""

import os

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from alembic import command
from shop_core import Settings, SettingsError, build_container, check_database
from shop_core.infra.schema import HEAD_REVISION, SCHEMA

from conftest import _ROOT, migrate_to_head

needs_pg = pytest.mark.skipif(
    "TEST_DATABASE_URL" not in os.environ, reason="TEST_DATABASE_URL not set"
)


def _config() -> Config:
    cfg = Config(str(_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_ROOT / "migrations"))
    return cfg


def test_head_revision_constant_matches_the_alembic_head():
    heads = ScriptDirectory.from_config(_config()).get_heads()
    assert heads == [HEAD_REVISION]


@pytest.fixture
def app_url(pg_url):
    """head まで移行した DB と、CREATE を持たず版の表を読めるロール。作れない環境では skip"""
    name = "rev_app_test"
    admin = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f"drop role if exists {name}"))
            conn.execute(text(f"create role {name} login password 'pw'"))
    except Exception as exc:
        admin.dispose()
        pytest.skip(f"cannot create roles: {exc}")
    migrate_to_head(pg_url)
    with admin.connect() as conn:
        conn.execute(text(f"grant usage on schema {SCHEMA} to {name}"))
        conn.execute(text(f"grant select on all tables in schema {SCHEMA} to {name}"))
    yield make_url(pg_url).set(username=name, password="pw").render_as_string(hide_password=False)
    with admin.connect() as conn:
        conn.execute(text(f"drop owned by {name}"))
        conn.execute(text(f"drop role if exists {name}"))
    admin.dispose()


@needs_pg
def test_check_database_passes_at_head(app_url):
    container = build_container(Settings(database_url=app_url))
    try:
        check_database(container)
    finally:
        container.engine().dispose()


@needs_pg
def test_check_database_fails_one_step_behind(pg_url, app_url):
    os.environ["DATABASE_URL"] = pg_url
    try:
        command.downgrade(_config(), "-1")
    finally:
        del os.environ["DATABASE_URL"]
    container = build_container(Settings(database_url=app_url))
    try:
        with pytest.raises(SettingsError) as ei:
            check_database(container)
        assert str(ei.value) == f"database schema is at 0006, library expects {HEAD_REVISION}"
    finally:
        container.engine().dispose()


@needs_pg
def test_check_database_fails_without_migrations(pg_url, app_url):
    admin = create_engine(pg_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f"drop table {SCHEMA}.alembic_version"))
    admin.dispose()
    container = build_container(Settings(database_url=app_url))
    try:
        with pytest.raises(SettingsError, match="alembic_version"):
            check_database(container)
    finally:
        container.engine().dispose()
