# 引継ぎ: ローカルLLMでマルチエージェント・オーケストレーション

前提は同ディレクトリの A2A + オーケストレータCLI(`src/agent-cli.ts`)。
次は「1オーケストレータが複数のスキル違いエージェントを発見・選択・委譲する」自律版。

## 決定

| 項目             | 選択                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| オーケストレータ | Qwen3-8B Instruct系 Q5_K_M(無ければQ4_K_M)                                     |
| サブエージェント | Qwen3-4B-Instruct-2507 / 1.7B                                                  |
| ランタイム       | ollama(マルチモデルを1デーモンで捌ける・切替が `ollama pull` だけ・既に稼働中) |
| 量子化           | ツール駆動はQ4よりQ5推奨(劣化に弱い)                                           |

## モデルの状況(検証済み / ダメ / その他候補)

検証済み(今回このリポジトリで動かした):

- Qwen3-4B-Instruct-2507 Q4: ツール呼び出し可。ただし temperature 0 + 「必ずツール経由」明示が必須。オーケストレータの下限、サブには十分

ダメだった:

- Qwen3-1.7B Q6: ツール呼び出しで生JSON化して破綻。チャットのみ可、ツール駆動は不可

未検証の第一候補:

- Qwen3-8B Instruct系: 小型帯のツール呼び出し定番("golden mean")。オーケストレータ本命。まず試す

その他候補(未検証、次に試す):

- Llama 3.1 8B Instruct — 無難・成熟・ollama対応厚い
- Salesforce xLAM-2 8B — 関数呼び出し専用学習、同サイズBFCL上位。ツール最優先ならこれ
- IBM Granite 4 8B — Apache 2.0、ツール+RAG目的で設計
- Ministral 8B / Mistral Small 24B — ネイティブFC・JSON綺麗(24Bは13GBだとQ4でもタイト)
- Gemma 12B — 総合力高いがFCがプロンプトベース寄りで生JSON化しやすい。ネイティブFCか要確認
- Cohere Command R7B — ツール/RAG向け、ただし非商用ライセンス(CC-BY-NC)

判断の軸: マルチエージェントはオーケストレータの判断品質がボトルネックなので、そこに8B級。サブは小型で可。調査でも定番構成は「8B/32Bをオーケストレータ、1.7Bをサブ」。

## ハードウェア天井

CPU実行のみ(Ryzen 7 4750U、GPUなし)、RAM 15GB(空き約13GB)。速度目安: 4B ~20-60秒/ターン、8B その約2倍、14B は数分で対話には重い。

## ランタイム: ollama に切り替える理由

前回は学習目的で llamafile を選び ollama を避けたが、マルチエージェント段階では実利が勝る。オーケストレータ8B + サブ4B/1.7B と複数モデルを同時に使うので、1プロセス1モデルの llamafile だとポート違いで複数並べる羽目になる。ollama は :11434 の1エンドポイントから複数モデルをオンデマンドに出す。glibc/APE/WSL2 の罠も無い。OpenAI互換なので `baseURL` を `http://localhost:11434/v1` に替えるだけ。

ollama を嫌う理由(タグの不誠実さ・脆弱性)はローカル閉じ・Qwen3系では実害にならない(タグ問題は主に DeepSeek-R1 蒸留版の件、`qwen3:8b` は妥当な量子化を引く)。透明性優先なら llamafile 版に戻せる。

## 将来の一手(RAM 32GB に増設できるなら)

オーケストレータを Qwen3-30B-A3B(MoE)に。活性化約3Bなので8B並みの速度で大型並みの計画性。CPU実行と好相性。ただし全重みをRAMに置く必要があり Q4 で約18GB、今の15GBには載らない。増設すればこの環境で最も効く投資(GPU増設より現実的)。

## 設計原則(今回の学びの一般化)

- 発見・選択・アドレス解決・contextId管理は決定的なハーネス側。LLMは意図解釈と生成だけ(小型LLMにUUIDを操作させない)
- ツール呼び出しは temperature 0 + 「必ずツール経由」明示 + 実行ログ可視化(捏造の目視検出)
- エージェント選択は AgentCard のスキル記述を根拠に。最終的な接続先解決はコードで検証
- 会話台帳は業務キーで引く。LLMの想起に頼らない

## 着手

```sh
ollama pull qwen3:8b          # オーケストレータ
ollama pull qwen3:4b          # サブ(1.7b も)
# config.ts の baseURL を :11434/v1、モデル名を ollama タグに
bun run agent                 # カズ/ハナの会話継続+切替が通るか再検証
```

採用前チェック: 8Bが thinking ハイブリッドか非thinking(Instruct-2507系)か確認(thinking系は `/no_think` 要)。BFCL 最新順位を採用直前に一度見る。

## 参照

- BFCL V4: https://gorilla.cs.berkeley.edu/leaderboard.html
- Best Ollama Models for AI Agents 2026: https://localaimaster.com/blog/best-ollama-models-for-agents
- Qwen3 Agent Capabilities Tested: https://www.kunalganglani.com/blog/qwen3-agent-capabilities-review
- Function Calling Local LLMs: https://insiderllm.com/guides/function-calling-local-llms/
