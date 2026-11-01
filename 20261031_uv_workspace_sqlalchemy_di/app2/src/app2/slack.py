"""Slack への通知と、スラッシュコマンドの文字列の解釈"""

from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert

from shop_core import UserService
from shop_core.tables import SlackLink

USAGE = "使い方: /order <商品ID> <個数>"


class SlackNotifier:
    def __init__(self, client: Any):
        self._client = client

    def post(self, channel: str, text: str) -> None:
        self._client.chat_postMessage(channel=channel, text=text)


def parse_order_text(text: str) -> tuple[int, int]:
    """`"<product_id> <quantity>"` を (product_id, quantity) にする。不正なら ValueError"""
    parts = text.split()
    if len(parts) != 2:
        raise ValueError(USAGE)
    try:
        product_id, quantity = int(parts[0]), int(parts[1])
    except ValueError:
        raise ValueError(USAGE) from None
    if quantity <= 0:
        raise ValueError(USAGE)
    return product_id, quantity


def resolve_user_id(tx: Any, users: UserService, slack_user_id: str, user_name: str) -> int:
    """Slack ユーザーに対応する基盤のユーザー ID。なければ登録して slack_links に記録する。

    tx.session を使うので、フェイクの transaction では動かない。DB なしのテストでは差し替える
    """
    link = tx.session.get(SlackLink, slack_user_id)
    if link is not None:
        return link.user_id
    # スラッシュコマンドにメールアドレスは載らないので、仮のアドレスで登録する
    user = users.register(email=f"{slack_user_id}@slack.local", name=user_name)
    # 同じ Slack ユーザーの同時コマンドで主キーが衝突しても失敗させない。負けた側は勝った側の行を読む
    tx.session.execute(
        pg_insert(SlackLink)
        .values(slack_user_id=slack_user_id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=[SlackLink.slack_user_id])
    )
    return tx.session.get(SlackLink, slack_user_id, populate_existing=True).user_id
