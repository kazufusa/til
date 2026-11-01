"""Slack の設定。環境変数の名前と未設定時のエラーはアプリ側の持ち物"""

import os
from dataclasses import dataclass


class SlackSettingsError(RuntimeError):
    """必須の設定が足りないときのエラー"""


@dataclass(frozen=True)
class SlackSettings:
    bot_token: str
    signing_secret: str

    @classmethod
    def from_env(cls) -> "SlackSettings":
        missing = [k for k in ("SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET") if not os.environ.get(k)]
        if missing:
            raise SlackSettingsError(f"{', '.join(missing)} is not set")
        return cls(
            bot_token=os.environ["SLACK_BOT_TOKEN"],
            signing_secret=os.environ["SLACK_SIGNING_SECRET"],
        )
