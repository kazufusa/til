"""alembic の実行環境。CI/CD の migrate コンテナだけが、マイグレーション用のロールで実行する。

オンラインの実行は、次の 2 つを守る。

- 先頭で pg_advisory_lock(MIGRATION_LOCK_KEY)を取る。migrate ジョブが同時に 2 つ走っても、
  後から来た方は先のジョブが終わるまで待つ(直列になる)。ロックは接続を閉じるときにも外れる
- ロックを取ったあとに lock_timeout を '10s' にする。DDL がアプリの長いトランザクションのロックを
  待ち続けて、全アプリのクエリを巻き込んで詰まるのを防ぐ。待ちが切れたら移行は失敗するので、
  負荷の低いときにやり直す。順序はロックが先で、他のジョブを待つ時間は lock_timeout の対象にしない
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from shop_core import tables  # noqa: F401
from shop_core.infra.orm import Base
from shop_core.infra.schema import SCHEMA

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
target_metadata = Base.metadata

# "shopmigr" の ASCII。他の用途の advisory lock と衝突しない固定の鍵
MIGRATION_LOCK_KEY = 0x73686F706D696772
DDL_LOCK_TIMEOUT = "10s"


# スキーマは shop の 1 つ。alembic_version も shop に置く
def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"options": "-c search_path=public"},
    )
    with connectable.connect() as connection:
        # DB ユーザー名が shop だと、既定の search_path の "$user" で shop が既定スキーマになり、
        # alembic の比較が schema 付きのテーブルとずれる。public を既定にして shop を明示で扱う
        connection.execute(text("select pg_advisory_lock(:key)"), {"key": MIGRATION_LOCK_KEY})
        connection.execute(text(f"set lock_timeout = '{DDL_LOCK_TIMEOUT}'"))
        connection.execute(text(f"create schema if not exists {SCHEMA}"))
        connection.commit()
        try:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                include_schemas=True,
                version_table_schema=SCHEMA,
            )
            with context.begin_transaction():
                context.run_migrations()
        finally:
            connection.rollback()
            connection.execute(
                text("select pg_advisory_unlock(:key)"), {"key": MIGRATION_LOCK_KEY}
            )
            connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
