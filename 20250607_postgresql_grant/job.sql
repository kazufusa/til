DO $$
DECLARE
  member_name text;
BEGIN
  FOR member_name IN
    SELECT member.rolname
    FROM pg_auth_members m
      JOIN pg_roles role ON m.roleid = role.oid
      JOIN pg_roles member ON m.member = member.oid
    WHERE role.rolname = 'admin'
  LOOP
    RAISE NOTICE 'Revoking appschema privileges for: %', member_name;
    PERFORM appschema.revoke_appschema_privileges(member_name);
  END LOOP;
END $$;
