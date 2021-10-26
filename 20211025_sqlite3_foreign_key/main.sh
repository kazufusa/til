#!/bin/sh

set -Ceux

rm -rf db.sqlite3

cat << EOF | sqlite3 db.sqlite3
.headers on
.mode column

create table users (id int primary key, name text);
create table companies (id int primary key, name text);
create table users_companies (
  id int primary key,
  user_id int,
  company_id int,
  foreign key (user_id) references users(id)
  foreign key (company_id) references companies(id)
);
PRAGMA foreign_keys=true;
.schema

insert into users values (1, 'alpha');
insert into users values (2, 'beta');
insert into users values (3, 'gamma');
insert into companies values (1, 'HOGE');
insert into companies values (2, 'FUGA');
insert into users_companies values (1, 1, 1);
insert into users_companies values (2, 2, 2);
insert into users_companies values (3, 3, 2);
insert into users_companies values (4, 4, 1);

select
  users_companies.id,
  users.id as user_id,
  users.name as user_name,
  companies.id as company_id,
  companies.name as company_name
from
  users_companies
left join users on user_id = users.id
left join companies on company_id = companies.id
;
EOF
