# ビルドコンテキストはワークスペースのルート(shop_core と uv.lock が要る)
#   docker build -f app1/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /work
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
COPY pyproject.toml uv.lock .python-version ./
COPY packages/shop_core ./packages/shop_core
COPY app1 ./app1
# --package で app1 とその依存だけ入れる。他のアプリは入れない
RUN uv sync --frozen --no-dev --package app1
ENV PATH="/work/.venv/bin:$PATH"
CMD ["uvicorn", "app1.main:app", "--host", "0.0.0.0", "--port", "8000"]
