"""app2 のコンポジションルート。shop_core の build_container で核を作って AppContainer に差し込む"""

from shop_core import EventPublisher, Settings, build_container

from app2.container import AppContainer


def build_app_container(
    settings: Settings | None = None, *, publisher: EventPublisher | None = None
) -> AppContainer:
    """核の Container を shop_core.build_container で作り、AppContainer の core に入れる。

    DB にも S3 にも Slack にも接続しない。Slack の設定(SlackSettings)は最初の利用まで読まない。
    publisher はドメインイベントの送り先で、ENV が local 以外では必須(build_container と同じ)。
    返り値をモジュールのグローバルに持たず、プロセスの入口(lifespan)から呼ぶ。
    """
    return AppContainer(core=build_container(settings, publisher=publisher))
