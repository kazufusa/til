"""app2 のコンテナ。shop_core の Container を入れ子にして、Slack の部品を足す"""

from dependency_injector import containers, providers
from slack_sdk import WebClient
from slack_sdk.signature import SignatureVerifier

from app2.settings import SlackSettings
from app2.slack import SlackNotifier
from shop_core import Container as CoreContainer


class AppContainer(containers.DeclarativeContainer):
    # Configuration.from_env(required=True) は import 時に読んで落ちるので、最初の利用まで遅らせる Singleton にする
    settings = providers.Singleton(SlackSettings.from_env)

    core = providers.Container(CoreContainer)

    slack_client = providers.Singleton(WebClient, token=settings.provided.bot_token)
    verifier = providers.Singleton(SignatureVerifier, signing_secret=settings.provided.signing_secret)
    notifier = providers.Singleton(SlackNotifier, client=slack_client)
