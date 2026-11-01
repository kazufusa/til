"""基盤が管理する Postgres スキーマ名。ORM、ビュー、接続設定、マイグレーションが共通で使う"""

SCHEMA = "shop"

# このライブラリのマイグレーションの先頭(head)の版。check_database が DB の版と突き合わせる。
# マイグレーションを足したら、ここも合わせる(tests/test_schema_revision.py が alembic の head と照合する)
HEAD_REVISION = "0007"
