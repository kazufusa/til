"""アプリ2: Slack アプリ。イベントの受信とスラッシュコマンドでの注文"""

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import parse_qs

from fastapi import Depends, FastAPI, HTTPException, Request
from slack_sdk.errors import SlackApiError
from slack_sdk.signature import SignatureVerifier

from app2.bootstrap import build_app_container
from app2.container import AppContainer
from app2.slack import SlackNotifier, parse_order_text, resolve_user_id
from shop_core import (
    AsyncTransactionScope,
    DependencyError,
    DomainError,
    EventPublishError,
    OrderService,
    UserService,
    check_database,
    configure_thread_limit,
    run_sync,
)
from shop_core.fastapi import order_service, transaction_async, user_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """起動時に AppContainer を作って検査し、app.state に置く。終了時に片付ける。

    app2 は DB を使うが S3 は使わないので、check_image_store は呼ばない
    """
    container = build_app_container()
    core = container.core
    check_database(core)
    # run_sync / tx.run のスレッド数を接続プールの最大数にそろえる(接続待ちのタイムアウトを減らす)
    configure_thread_limit(core)
    app.state.container = container
    try:
        yield
    finally:
        core.engine().dispose()


app = FastAPI(title="app2: slack", lifespan=lifespan)


def get_container(request: Request) -> AppContainer:
    return request.app.state.container


def get_verifier(c: AppContainer = Depends(get_container)) -> SignatureVerifier:
    return c.verifier()


def get_notifier(c: AppContainer = Depends(get_container)) -> SlackNotifier:
    return c.notifier()


def _ephemeral(text: str) -> dict:
    return {"response_type": "ephemeral", "text": text}


async def _verified_body(request: Request, verifier: SignatureVerifier) -> bytes:
    body = await request.body()
    if not verifier.is_valid_request(body, dict(request.headers)):
        raise HTTPException(status_code=401, detail="invalid signature")
    return body


@app.post("/slack/events")
async def events(request: Request, verifier: SignatureVerifier = Depends(get_verifier)):
    body = await _verified_body(request, verifier)
    payload = json.loads(body)
    if payload.get("type") == "url_verification":
        return {"challenge": payload["challenge"]}
    # イベントは受け取ったと返すだけ
    return {"ok": True}


@app.post("/slack/commands")
async def commands(
    request: Request,
    verifier: SignatureVerifier = Depends(get_verifier),
    users: UserService = Depends(user_service),
    orders: OrderService = Depends(order_service),
    notifier: SlackNotifier = Depends(get_notifier),
    scope: AsyncTransactionScope = Depends(transaction_async),
):
    body = await _verified_body(request, verifier)
    form = {k: v[0] for k, v in parse_qs(body.decode()).items()}
    user_id, user_name, channel_id = form["user_id"], form["user_name"], form["channel_id"]
    order = None
    event_lost = False
    try:
        product_id, quantity = parse_order_text(form.get("text", ""))
        # 同期のサービスはスレッドで呼ぶ。イベントループは止めない
        async with scope as tx:
            uid = await tx.run(resolve_user_id, tx, users, user_id, user_name)
            order = await tx.run(orders.place, uid, [(product_id, quantity)])
    except ValueError as exc:
        return _ephemeral(str(exc))
    except EventPublishError:
        # commit は成功している。注文は確定済みで、送れなかったのはドメインイベントだけ。
        # やり直すと二重に注文するので、ログに残して受付は返す
        logger.exception("order committed but event publish failed")
        event_lost = order is not None
        if order is None:
            return _ephemeral("処理が完了したか確認できません。注文の一覧を確かめてください")
    except DependencyError as exc:
        # DB の一時的な障害。Slack には 200 の本文を見せ、時間を置いて再実行してもらう
        logger.warning("dependency error: %s", exc.code)
        return _ephemeral(
            f"ただいま混み合っています。しばらくしてからもう一度お試しください ({exc.code})"
        )
    except DomainError as exc:
        # Slack は 200 の本文をユーザーに見せるので、ドメインエラーも 200 で返す
        return _ephemeral(f"{exc} ({exc.code})")
    # Slack への投稿は取り消せないので、サービスの呼び出しが終わった(commit 済み)後に行う
    try:
        await run_sync(
            notifier.post,
            channel_id,
            f"{user_name} が商品 {product_id} を {quantity} 個注文しました。合計 {order.total} 円",
        )
    except SlackApiError:
        # 注文は確定済みなので、通知の失敗はログに残して注文の受付は返す
        logger.exception("slack post failed")
    note = "(後続の通知が遅れることがあります)" if event_lost else ""
    return _ephemeral(f"注文 {order.id} を受け付けました{note}")
