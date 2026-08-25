# AgentCore+Strands+OTELで実行時の全コンテキストや出力を収集する

## 要求

- AWS Bedrock AgentCoreを使う
- Strands(Python)を使う
- Strans Graphを使って、Agent2つとPython機械的処理(検証ゲート)を組み合わせた処理を行う
- OTELを使って、Agentのコンテキストや出力のすべてと、機械的処理ゲートの評価対象,判断基準,判断結果を記録する
- 判断結果がNGの場合に、Strands Graph実行全OTEL記録jsonlをs3に保持する
- terraformを使う. planとapplyは人間が行う
- AgentCoreはローカルから実行する。この時、実行時の引数で、機械的処理ゲートの成功/失敗を制御させる。機械的処理ゲートはつまり、Agentの出力を受けるが、判断基準はこのリクエスト時の成否パラメータに依存する
- AgentCoreの実行時引数のパラメータには、エージェンの入力プロンプトにそのまま入るものも用意する。これを巨大にしたり小さくしたりして、OTEL記録におけるプロンプト切り落としの有無を判定する
- 作業が終わったらterraformですべてのリソースを削除できること
- AgentCoreへのデプロイはStrandsコマンドを使って行う。
- 必要な仕様は事前にすべて策定する
