"""ローカル OpenAI 互換サーバ (port 11434) 向けの model factory."""

import os

from strands.models.openai import OpenAIModel

DEFAULT_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
DEFAULT_MODEL_ID = os.getenv("LLM_MODEL_ID", "haiku:latest")


def make_model(model_id: str = DEFAULT_MODEL_ID, **params) -> OpenAIModel:
    """OpenAI 互換サーバに接続する OpenAIModel を返す.

    api_key はローカルサーバでは検証されないためダミーを渡す.
    """
    return OpenAIModel(
        client_args={
            "api_key": "dummy",
            "base_url": DEFAULT_BASE_URL,
        },
        model_id=model_id,
        params=params or {"max_tokens": 512},
    )
