"""configure_thread_limit は anyio のスレッド上限を接続プールの最大数にそろえる"""

import anyio.to_thread
import pytest

from shop_core import Container, Settings, configure_thread_limit

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def test_thread_limit_equals_pool_size_plus_max_overflow():
    c = Container(Settings(database_url="postgresql+psycopg://u:p@localhost/shop", pool_size=3, max_overflow=2))
    limiter = anyio.to_thread.current_default_thread_limiter()
    before = limiter.total_tokens
    try:
        configure_thread_limit(c)
        assert anyio.to_thread.current_default_thread_limiter().total_tokens == 5
    finally:
        limiter.total_tokens = before
