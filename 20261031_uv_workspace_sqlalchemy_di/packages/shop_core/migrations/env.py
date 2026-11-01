import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from shop_core import tables  # noqa: F401
from shop_core.infra.orm import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
target_metadata = Base.metadata


# スキーマは shop の 1 つ。alembic_version も shop に置く
def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        version_table_schema="shop",
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
        connection.execute(text("create schema if not exists shop"))
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            version_table_schema="shop",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
