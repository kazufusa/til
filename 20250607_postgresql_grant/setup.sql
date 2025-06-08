CREATE SCHEMA IF NOT EXISTS appschema;

DO $$
BEGIN
  -- すでに存在していない場合だけ作成
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin') THEN
    CREATE ROLE admin;
  END IF;
END $$;

-- =======================================
-- 🎯 2️⃣ admin ロールに app_datamart の接続・スキーマ作成権限を付与
-- =======================================
GRANT CONNECT, CREATE ON DATABASE app_datamart TO admin;

-- =======================================
-- 🎯 3️⃣ admin ロールに appschema の全権限を付与
-- =======================================
GRANT USAGE, CREATE ON SCHEMA appschema TO admin;

-- 既存テーブル・シーケンス・関数にフル権限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA appschema TO admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA appschema TO admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA appschema TO admin;

-- 将来作成されるオブジェクトにも自動的にフル権限を付与
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT ALL PRIVILEGES ON TABLES TO admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT ALL PRIVILEGES ON SEQUENCES TO admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT ALL PRIVILEGES ON FUNCTIONS TO admin;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runner') THEN
    CREATE ROLE runner;
  END IF;
END $$;

GRANT CONNECT ON DATABASE app_datamart TO runner;

GRANT USAGE ON SCHEMA appschema TO runner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA appschema TO runner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA appschema TO runner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA appschema TO runner;

ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runner;
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT USAGE, SELECT ON SEQUENCES TO runner;
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT EXECUTE ON FUNCTIONS TO runner;

-- =======================================
-- 🎯 1️⃣ reader ロールを作成する
-- =======================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reader') THEN
    CREATE ROLE reader;
  END IF;
END $$;

-- =======================================
-- 🎯 2️⃣ reader ロールに app_datamart への接続権限を付与
-- =======================================
GRANT CONNECT ON DATABASE app_datamart TO reader;

-- =======================================
-- 🎯 3️⃣ reader ロールに appschema の閲覧権限だけを付与
-- =======================================
-- スキーマの使用（SELECTするために必要）
GRANT USAGE ON SCHEMA appschema TO reader;

-- 既存テーブル・シーケンスの閲覧権限のみ
GRANT SELECT ON ALL TABLES IN SCHEMA appschema TO reader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA appschema TO reader;

-- 将来作成されるテーブル・シーケンスにも自動的に閲覧権限を付与
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT SELECT ON TABLES TO reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA appschema GRANT USAGE, SELECT ON SEQUENCES TO reader;

CREATE OR REPLACE FUNCTION appschema.revoke_appschema_privileges(target_role text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE app_datamart FROM %I;', target_role);
  EXECUTE format('REVOKE CREATE ON DATABASE app_datamart FROM %I;', target_role);

  EXECUTE format('REVOKE USAGE, CREATE ON SCHEMA appschema FROM %I;', target_role);

  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA appschema FROM %I;', target_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA appschema FROM %I;', target_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA appschema FROM %I;', target_role);

  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA appschema REVOKE ALL PRIVILEGES ON TABLES FROM %I;', target_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA appschema REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I;', target_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA appschema REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I;', target_role);
END;
$$;
