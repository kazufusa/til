from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker


def make_engine(
    database_url: str,
    *,
    echo: bool = False,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_timeout: float = 30.0,
    pool_recycle: int = -1,
    pool_pre_ping: bool = True,
) -> Engine:
    return create_engine(
        database_url,
        echo=echo,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=pool_pre_ping,
        connect_args={"options": "-c search_path=shop"},
    )


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
