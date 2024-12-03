# https://skydum.hatenablog.com/entry/2024/09/09/2h15936

ARG PYTHON_VERSION="3.12.5"

# uvの公式docker image
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION%.*}-bookworm-slim as build

# UV_LINK_MODE wheelからパッケージをコピーしてインストールする
# UV_COMPILE_BYTECODE インストール後にソースファイルをバイトコードにコンパイルする
# UV_PYTHON_DOWNLOADS コンテナのpython環境を使うのでuvにはpythonをダウンロードさせない
# UV_PYTHON uvを操作する際に利用するpythonを指定する
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=python${PYTHON_VERSION%.*}

WORKDIR /app
COPY ./pyproject.toml /app
COPY ./uv.lock /app

# uv syncした時の情報をキャッシュして、次回以降再利用できるようにして、次回以降のビルド時間を短縮
RUN --mount=type=cache,target=/root/.cache \
    set -ex && \
    cd /app && \
    uv sync --frozen --no-install-project

COPY ./app /app

FROM python:${PYTHON_VERSION}-slim-bookworm

ENV PATH=/app/.venv/bin:$PATH

WORKDIR /app

COPY --from=build /app /app

EXPOSE 8000

CMD [ "fastapi", "run" ]
