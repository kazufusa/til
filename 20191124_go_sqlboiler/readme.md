

```
$ sqlite3 db.sqlite3 < createdb.sql
$ sqlite3 db.sqlite3 .dump

-- Loading resources from /Users/kazufusa/.sqliterc
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
  id integer primary key autoincrement,
  name text not null
);
CREATE TABLE todo (
  id integer primary key autoincrement,
  user_id integer,
  title text not null,
  note text,
  finished boolean not null,
  due_date datetime,
  foreign key(user_id) references users(id)
);
DELETE FROM sqlite_sequence;
COMMIT;

$ sqlboiler --wipe --no-auto-timestamps --no-hooks --no-rows-affected --no-tests -p db -o db sqlite3
```
