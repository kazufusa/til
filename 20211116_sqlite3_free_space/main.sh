#!/bin/sh

set -Ceu

rm -rf main.sqlite3

cat <<EOF | sqlite3 main.sqlite3
create table test (
  id int primary_key auto increment,
  memo text
);
EOF

insert()
{
echo \# insert
for i  in `seq 100`; do
cat <<EOF | sqlite3 main.sqlite3
insert into test (memo) values (
'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);
EOF
done
ls -lht main.sqlite3 | awk '{print $5 " " $9}'
}

delete()
{
echo \# delete all records
cat <<EOF | sqlite3 main.sqlite3
delete from test;
EOF
ls -lht main.sqlite3 | awk '{print $5 " " $9}'
}


echo \# initial
ls -lht main.sqlite3 | awk '{print $5 " " $9}'
insert
delete
insert
insert
delete
insert
delete
insert
insert
insert
insert
insert
