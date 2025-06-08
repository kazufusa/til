## flow

```sh
cat init.sql | PGPASSWORD=postgres psql -h localhost -U postgres -d postgres
cat setup.sql | PGPASSWORD=postgres psql -h localhost -U postgres -d app_datamart
GRANT admin TO "deploy_web_app@xxxxxx.iam" WITH ADMIN OPTION;
GRANT admin TO "reader";
SELECT appschema.revoke_appschema_privileges('user');
```


## Show all databases

```postgresql
postgres=# \l+
                                                                   List of databases
   Name    |  Owner   | Encoding |  Collate   |   Ctype    |   Access privileges   |  Size   | Tablespace |                Description
-----------+----------+----------+------------+------------+-----------------------+---------+------------+--------------------------------------------
 postgres  | postgres | UTF8     | en_US.utf8 | en_US.utf8 |                       | 7475 kB | pg_default | default administrative connection database
 template0 | postgres | UTF8     | en_US.utf8 | en_US.utf8 | =c/postgres          +| 7321 kB | pg_default | unmodifiable empty database
           |          |          |            |            | postgres=CTc/postgres |         |            |
 template1 | postgres | UTF8     | en_US.utf8 | en_US.utf8 | =c/postgres          +| 7547 kB | pg_default | default template for new databases
           |          |          |            |            | postgres=CTc/postgres |         |            |
(3 rows)
```

## Show all roles


```postgresql
postgres=# \du
                                   List of roles
 Role name |                         Attributes                         | Member of
-----------+------------------------------------------------------------+-----------
 postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS | {}
```
