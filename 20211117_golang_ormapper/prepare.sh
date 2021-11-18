#!/bin/sh

PGPASSWORD=postgres psql -h localhost -U postgres <<EOF
drop table users;
drop table posts;
create table if not exists users (id serial primary key, name text);
create table if not exists posts (id serial primary key, user_id int, content text);
insert into users (name) values ('Alpha'), ('Bravow');
insert into posts (user_id, content) values
  (1, 'I am Alpha.'),
  (1, 'How do you do.'),
  (2, 'I am Bravow.')
;
select * from users;
select * from posts;
select posts.id, posts.user_id, users.name, posts.content from posts left join users on user_id = users.id;
EOF
