# python and uv

## make fastapi app and run

```sh
uv init fast-app
cd fast-app
uv add fastapi --extra standard
uv sync
vim app/main.py
uv run fastapi dev # or `uv run fastapi run`
```

## Dockerfile

```sh
docker image build -t uv-fastapi .
docker run --rm -p 8000:8000 uv-fastapi
```
