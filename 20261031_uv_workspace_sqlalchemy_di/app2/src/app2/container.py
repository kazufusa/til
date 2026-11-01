"""app2 のコンテナ。shop_core の Container を属性として持ち、Slack の部品を足す"""

from slack_sdk import WebClient
from slack_sdk.signature import SignatureVerifier

from shop_core import Container as CoreContainer
from shop_core import ContainerBase, provider

from app2.settings import SlackSettings
from app2.slack import SlackNotifier


class AppContainer(ContainerBase):
    def __init__(self, core: CoreContainer, settings: SlackSettings | None = None) -> None:
        super().__init__()
        # 入れ子は属性として持つ。core.user_service() のように呼ぶ
        self.core = core
        self._settings = settings

    # 環境変数は最初の利用まで読まない
    @provider(singleton=True)
    def settings(self) -> SlackSettings:
        return self._settings if self._settings is not None else SlackSettings.from_env()

    @provider(singleton=True)
    def slack_client(self) -> WebClient:
        return WebClient(token=self.settings().bot_token)

    @provider(singleton=True)
    def verifier(self) -> SignatureVerifier:
        return SignatureVerifier(signing_secret=self.settings().signing_secret)

    @provider(singleton=True)
    def notifier(self) -> SlackNotifier:
        return SlackNotifier(client=self.slack_client())
