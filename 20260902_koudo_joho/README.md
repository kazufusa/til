# 高度情報過去問解く

これを**最終版**にしましょう。目的は「高度情報で、大企業の監査・統制・セキュリティ・ログ・基盤運用を実務につなげて学ぶ」です。途中で出したものから、今のあなたの **AWS基盤担当（EKS/Lambda）** という観点で整理し直しました。

| 優先          | 試験・問題             | 主題                           | ここを学ぶ                                                                             | AWS基盤とのつながり                                                          | 公式問題                                                                                                                            |
| ------------- | ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ★★★★★         | **AU R7秋 午後I 問2**  | **クラウドサービスの監査**     | 管理者権限、MFA、設定変更、監査ログの完全性、内部不正、設定不備検知                    | **CloudTrail / IAM / Config / 管理者操作ログ**に直結。今回の目的で最重要     | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_au_pm1_qs.pdf?utm_source=chatgpt.com) ([IPA][1]) |
| ★★★★★         | **AU R6秋 午後I 問1**  | **DevOps環境の監査**           | 職務分離、本番権限、特権アクセス、CI/CD、開発者による本番操作                          | IAM、EKS/Lambdaのデプロイ権限、GitHub Actions等の本番権限設計につながる      | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/m42obm000000afqx-att/2024r06a_au_pm1_qs.pdf)                                   |
| ★★★★★         | **AU R6秋 午後I 問2**  | **本番変更の統制**             | 変更申請、承認、変更ログ、未承認変更、証跡                                             | Terraform/CI/CDで「誰が何を変更したか」をどう証明するかにつながる            | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/m42obm000000afqx-att/2024r06a_au_pm1_qs.pdf)                                   |
| ★★★★★         | **SM H24秋 午後I 問4** | **脆弱性検査とログ**           | サーバログ、特権操作、ログ調査、**複数サーバのログ突合、時刻同期**                     | CloudWatch Logs、EKS複数Pod/Node、相関調査の考え方そのもの                   | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/ug65p90000002h5m-att/2012h24a_sm_pm1_qs.pdf) ([IPA][2])                        |
| ★★★★★ ※高度外 | **AP R7春 午後 問8**   | **アプリのエラー・ログ設計**   | システム障害/システムエラー/業務エラーの分類、何をログに残すか、利用者向け情報との分離 | 「アプリがCloudWatchに何を吐くべきか」の理解に一番直接的                     | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_ap_pm_qs.pdf?utm_source=chatgpt.com) ([IPA][3])  |
| ★★★★☆         | **SM R6春 午後II 問1** | **DevOps時代の変更管理**       | 標準変更、CAB、承認プロセス、内部統制を維持した高速化                                  | 「監査が厳しい会社でCI/CDをどう成立させるか」が分かる                        | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/m42obm000000afqx-att/2024r06h_sm_pm2_qs.pdf) ([IPA][4])                        |
| ★★★★☆         | **SM R7春 午後I 問1**  | **インシデント管理・問題管理** | 記録、分類、エスカレーション、既知の誤り、SLA、原因分析                                | CloudWatchアラーム後に「組織として何をするか」を理解できる                   | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_sm_pm1_qs.pdf) ([IPA][5])                        |
| ★★★★☆         | **SC R7春 午後 問2**   | **脆弱性管理**                 | PF/Webアプリ診断、CVSS、対応優先順位、TLS、SSH、リスク評価                             | Security Hub等で脆弱性が出た後、**何を優先して直すか**という上位設計が分かる | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_sc_pm_qs.pdf)                                    |
| ★★★☆☆         | **NW R7春 午後I 問3**  | **セキュアWebゲートウェイ**    | 通信経路、企業NW、セキュリティサービス導入、ネットワーク設計・運用                     | VPC、FW、プロキシ、外向き通信制御などを考える基礎                            | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_nw_pm1_qs.pdf) ([IPA][6])                        |
| ★★★☆☆         | **NW R7春 午後II 問1** | **IPv6対応ネットワーク**       | IPv6、DNS、経路制御、FW、IPv4との違い                                                  | AWS VPCやSecurity Group以前に、通信制御そのものを理解する補強教材            | [問題PDF](https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_nw_pm2_qs.pdf) ([IPA][7])                        |

### 解く順番

今ならこの順が一番いいです。

**AU R7秋 問2
→ AU R6秋 問1
→ AU R6秋 問2
→ SM H24秋 問4
→ AP R7春 問8
→ SM R6春 午後II問1
→ SM R7春 問1
→ SC R7春 問2
→ NW**

最初の5問が特に強いです。

これをやると、

**なぜログを取るのか**
→ **何を証跡として残すのか**
→ **本番変更をどう統制するのか**
→ **ログをどう障害・不正調査に使うのか**
→ **アプリは何をログとして出すべきか**

まで一続きになります。

特に今やっているEKS/Lambdaのログ設計に対しては、**SM H24問4 + AP R7問8 + AU R7問2**の3本が直接効きます。「CloudWatchへ送る」より上の、**そもそも何のためにどんなログが必要なのか**が見える組合せです。

解答例・採点講評はIPAの年度別公式ページから全部たどれます。[令和7年度](https://www.ipa.go.jp/shiken/mondai-kaiotu/2025r07.html?utm_source=chatgpt.com) / [令和6年度](https://www.ipa.go.jp/shiken/mondai-kaiotu/2024r06.html?utm_source=chatgpt.com) / [平成24年度](https://www.ipa.go.jp/shiken/mondai-kaiotu/2012h24.html?utm_source=chatgpt.com)。

[1]: https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_au_pm1_qs.pdf?utm_source=chatgpt.com "AU令和７年度　秋期システム監査技術者試験午後Ⅰ　問題<table>"
[2]: https://www.ipa.go.jp/shiken/mondai-kaiotu/ug65p90000002h5m-att/2012h24a_sm_pm1_cmnt.pdf?utm_source=chatgpt.com "平成24 年度 秋期 IT サービスマネージャ試験 採点講評"
[3]: https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_ap_pm_qs.pdf?utm_source=chatgpt.com "令和7年度　春期　応用情報技術者試験　午後　問題冊子"
[4]: https://www.ipa.go.jp/shiken/mondai-kaiotu/m42obm000000afqx-att/2024r06h_sm_pm2_qs.pdf?utm_source=chatgpt.com "令和6年度　春期　ITサービスマネージャ試験　午後Ⅱ　問題冊子"
[5]: https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_sm_pm1_ans.pdf?utm_source=chatgpt.com "令和７年度 春期 IT サービスマネージャ試験 解答例"
[6]: https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_nw_pm1_cmnt.pdf?utm_source=chatgpt.com "令和7年度　春期　ネットワークスペシャリスト試験　午後Ⅰ　採点講評"
[7]: https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07h_nw_pm2_ans.pdf?utm_source=chatgpt.com "令和7年度　春期　ネットワークスペシャリスト試験　午後Ⅱ　解答例"
