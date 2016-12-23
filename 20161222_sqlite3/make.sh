#!/bin/sh

rm -rf test.db

cat << EOS | sqlite3 test.db
create table main (
  code        integer,
  id          integer,
  created_at  date
);

create table code (
  id integer,
  name string
);

create table id (
  id integer,
  name string
);

insert into main values
(1, 1, '2016-12-22 12:00'),
(2, 1, '2016-12-22 12:00'),
(3, 2, '2016-12-22 12:00');

insert into code values
(1, 'A'),
(2, 'B'),
(3, 'C');

insert into id values
(1, 'あああ'),
(2, 'いいい');

select
  code.name
  , id.name
  , main.created_at
from
  main
  , code
  , id
on
  main.code = code.id
  and main.id = id.id
;
EOS
