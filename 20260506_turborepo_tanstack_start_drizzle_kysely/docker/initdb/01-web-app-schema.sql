-- Bootstraps schemas on first start of the postgres data volume
-- (i.e. `docker compose up -d` with no existing volume,
--  or after `docker compose down -v`).
--
-- Local-only philosophy:
--   ローカルは superuser 1 人 (= POSTGRES_USER=app) で全部やる。
--   ロール管理 / GRANT は infra 側の責務として一切書かない。
--   schema を分ける目的は「テーブルがどのモジュールの所有か」を名前空間で
--   示すことだけ。
--
-- Drizzle migrations は schema 内のテーブル / 制約 / インデックスのみ管理する。

CREATE SCHEMA IF NOT EXISTS web_app;
