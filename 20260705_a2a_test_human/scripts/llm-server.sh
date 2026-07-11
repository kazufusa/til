#!/bin/sh
# llamafile でローカルLLMを起動する (OpenAI互換 API: http://localhost:8080/v1)
# モデルは llm-checker recommend の BEST OVERALL (Qwen3-1.7B Q6_K)
#
# 注意: WSL2 では APE バイナリが Windows interop と衝突するため ape ローダー経由で起動する。
# (プリビルドの llama-server は glibc 2.32+ 要求で Ubuntu 20.04 では動かない)

APE="${APE:-$HOME/.local/bin/ape}"
LLAMAFILE="${LLAMAFILE:-$HOME/.local/bin/llamafile}"
MODEL="${MODEL:-$HOME/.cache/llama-models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf}"
PORT="${LLM_PORT:-8080}"

exec "$APE" "$LLAMAFILE" \
  -m "$MODEL" \
  --server \
  --port "$PORT" \
  -c 8192
