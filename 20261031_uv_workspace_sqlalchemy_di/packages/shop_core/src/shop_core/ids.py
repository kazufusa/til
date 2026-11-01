"""ID の採番。UUIDv7(時刻順に並ぶ UUID)を使う。

文字列にするときの正規形は str(uuid)(小文字、ハイフン区切り)。
S3 のキーや API の入出力はこの形で統一する。
"""

import uuid

from uuid6 import uuid7


def new_id() -> uuid.UUID:
    """新しい UUIDv7。Python 3.13 に uuid.uuid7 はないので uuid6 パッケージを使う"""
    return uuid.UUID(int=uuid7().int)
