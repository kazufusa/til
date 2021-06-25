#!/bin/bash
# https://gist.github.com/elyezer/6450054#gistcomment-3789954

cat <<EOF | sqlite3 test.sqlite3
-- Example table
CREATE TABLE IF NOT EXISTS ring_buffer (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);

-- Number 10 on where statement defines the ring buffer's size
CREATE TRIGGER IF NOT EXISTS delete_tail AFTER INSERT ON ring_buffer
BEGIN
    DELETE FROM ring_buffer where id < NEW.id-100;
END;
EOF

for ((i=1;i<=1000;i++)); do
cat <<EOF | sqlite3 "test.sqlite3"
insert into ring_buffer (data) values ('test $RANDOM');
EOF
done

cat <<EOF | sqlite3 test.sqlite3
select * from ring_buffer order by id asc limit 5;
EOF
echo "(omitted)"
cat <<EOF | sqlite3 test.sqlite3
select * from (select * from ring_buffer order by id desc limit 5) t order by t.id
EOF
