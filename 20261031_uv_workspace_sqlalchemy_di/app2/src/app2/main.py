"""アプリ2: Slack アプリ。イベントの受信とスラッシュコマンドでの注文"""

import json
import logging
from urllib.parse import parse_qs

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, FastAPI, HTTPException, Request
from slack_sdk.errors import SlackApiError
from slack_sdk.signature import SignatureVerifier

from app2.container import AppContainer
from app2.slack import SlackNotifier, parse_order_text, resolve_user_id
from shop_core import DomainError, OrderService, UserService

logger = logging.getLogger(__name__)

container = AppContainer()

app = FastAPI(title="app2: slack")


def _ephemeral(text: str) -> dict:
    return {"response_type": "ephemeral", "text": text}


async def _verified_body(request: Request, verifier: SignatureVerifier) -> bytes:
    body = await request.body()
    if not verifier.is_valid_request(body, dict(request.headers)):
        raise HTTPException(status_code=401, detail="invalid signature")
    return body


@app.post("/slack/events")
@inject
async def events(request: Request, verifier: SignatureVerifier = Depends(Provide[AppContainer.verifier])):
    body = await _verified_body(request, verifier)
    payload = json.loads(body)
    if payload.get("type") == "url_verification":
        return {"challenge": payload["challenge"]}
    # イベントは受け取ったと返すだけ
    return {"ok": True}


@app.post("/slack/commands")
@inject
async def commands(
    request: Request,
    verifier: SignatureVerifier = Depends(Provide[AppContainer.verifier]),
    users: UserService = Depends(Provide[AppContainer.core.user_service]),
    orders: OrderService = Depends(Provide[AppContainer.core.order_service]),
    notifier: SlackNotifier = Depends(Provide[AppContainer.notifier]),
):
    body = await _verified_body(request, verifier)
    form = {k: v[0] for k, v in parse_qs(body.decode()).items()}
    user_id, user_name, channel_id = form["user_id"], form["user_name"], form["channel_id"]
    try:
        product_id, quantity = parse_order_text(form.get("text", ""))
        with container.core.transaction() as tx:
            uid = resolve_user_id(tx, users, user_id, user_name)
            order = orders.place(uid, [(product_id, quantity)])
    except ValueError as exc:
        return _ephemeral(str(exc))
    except DomainError as exc:
        # Slack は 200 の本文をユーザーに見せるので、ドメインエラーも 200 で返す
        return _ephemeral(str(exc))
    # Slack への投稿は取り消せないので、サービスの呼び出しが終わった(commit 済み)後に行う
    try:
        notifier.post(
            channel_id,
            f"{user_name} が商品 {product_id} を {quantity} 個注文しました。合計 {order.total} 円",
        )
    except SlackApiError:
        # 注文は確定済みなので、通知の失敗はログに残して注文の受付は返す
        logger.exception("slack post failed")
    return _ephemeral(f"注文 {order.id} を受け付けました")


container.wire(modules=[__name__])
