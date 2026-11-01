-- アプリ用ロール。スキーマへの権限はマイグレーション 0006 が付ける。
-- ロールはクラスタ全体のものなので、マイグレーション(スキーマの持ち物)ではなくここで作る。
-- 空のデータディレクトリの初回起動でだけ実行される
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shop_app') THEN
        CREATE ROLE shop_app LOGIN PASSWORD 'shop_app';
    END IF;
END
$$;
