# マイグレーション実行用。ビルドコンテキストはワークスペースのルート
#   docker build -f packages/shop_core/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /work
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
COPY pyproject.toml uv.lock .python-version ./
COPY packages/shop_core ./packages/shop_core
RUN uv sync --frozen --no-dev --package shop-core
ENV PATH="/work/.venv/bin:$PATH"
WORKDIR /work/packages/shop_core
CMD ["alembic", "upgrade", "head"]
