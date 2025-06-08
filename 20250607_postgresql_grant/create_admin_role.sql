DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_roles
     WHERE rolname = 'admin_app_datamart'
  ) THEN
    CREATE ROLE admin_app_datamart NOLOGIN;
  END IF;
END
$$;

GRANT admin_app_datamart TO CURRENT_USER;

DO $$
DECLARE
  target_role text;
BEGIN
  SELECT rolname
    INTO target_role
    FROM pg_roles
   WHERE rolname LIKE 'deploy_web_app@%.iam'
   LIMIT 1;

  IF target_role IS NOT NULL THEN
    EXECUTE format(
      'GRANT admin_app_datamart TO %I',
      target_role
    );
  END IF;
END
$$;

ALTER DATABASE app_datamart OWNER TO admin_app_datamart;

REVOKE CONNECT ON DATABASE app_datamart FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS app_schema
  AUTHORIZATION admin_app_datamart;

GRANT USAGE ON SCHEMA app_schema TO admin_app_datamart;

GRANT ALL ON ALL TABLES    IN SCHEMA app_schema TO admin_app_datamart;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app_schema TO admin_app_datamart;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA app_schema TO admin_app_datamart;

ALTER DEFAULT PRIVILEGES
  FOR ROLE "deploy_web_app@xxx.iam"
  IN SCHEMA app_schema
  GRANT ALL ON TABLES, SEQUENCES, FUNCTIONS TO admin_app_datamart;

SELECT member.rolname AS member
FROM pg_roles AS parent
JOIN pg_auth_members AS am     ON parent.oid = am.roleid
JOIN pg_roles AS member        ON member.oid = am.member
WHERE parent.rolname = 'admin_app_datamart'
ORDER BY member.rolname;
