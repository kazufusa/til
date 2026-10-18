# サンプルアプリ

標準ライブラリだけで動く、最小の Slack アプリです。

- `GET /` と `GET /healthz` は `hello from eks-exp` を返します。
- `GET /news` は NHK NEWS WEB の RSS を取得し、先頭 5 件の見出しを JSON で返します。
  Pod から外向きに通信できるかの確認用です。送信元は NAT の固定 IP です。
- `POST /slack/events` は Slack のイベントを受けます。署名を検証し、URL 検証に応答します。
- `app_mention` を受けると、そのメッセージのスレッドに `hello from eks-exp` を返信します。

## 環境変数

| 変数 | 内容 |
| --- | --- |
| `SLACK_SIGNING_SECRET` | 署名の検証に使います。未設定のときは検証を省き、警告を 1 度だけ出します。 |
| `SLACK_BOT_TOKEN` | 返信に使います。未設定のときは返信しません。 |

## ローカルでの確認

```bash
docker build -t eks-exp-app:local app/
docker run -d --rm --name eks-exp-app -p 18080:8080 eks-exp-app:local
curl localhost:18080/
curl localhost:18080/news
curl -X POST localhost:18080/slack/events -d '{"type":"url_verification","challenge":"abc123"}'
docker stop eks-exp-app
```

## Secret の作成

Pod は Secret `slack` を環境変数として読みます。
Secret が無くてもアプリは起動します。

```bash
kubectl -n app create secret generic slack \
  --from-literal=SLACK_SIGNING_SECRET=... \
  --from-literal=SLACK_BOT_TOKEN=xoxb-...
kubectl -n app rollout restart deploy/web
```

## Slack 側の設定

1. Slack の API サイトでアプリを作ります。
2. Event Subscriptions を有効にし、Request URL に `https://<CloudFront のドメイン>/slack/events` を入れます。
3. Subscribe to bot events に `app_mention` を足します。
4. OAuth の権限に `chat:write` を足し、ワークスペースにインストールします。
5. Basic Information の Signing Secret と、OAuth の Bot User OAuth Token を控えます。

Request URL を入れると、Slack が URL 検証を送ります。
アプリが応答すれば、画面に Verified と出ます。

返信のために slack.com へ出る通信は、NAT を通ります。
送信元 IP は NAT の固定 EIP です。
