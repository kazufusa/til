#!/bin/sh

PGPASSWORD=postgres psql -h localhost -U postgres <<EOF
drop table users;
drop table posts;
create table if not exists users (id serial primary key, name text, version int not null);
create table if not exists posts (id serial primary key, user_id int, content text, version int not null);
insert into users (name, version) values ('Alpha', 0), ('Bravow', 0);
insert into posts (user_id, content, version) values
  (1, 'I am Alpha.', 0),
  (1, 'How do you do.', 0),
  (2, 'I am Bravow.', 0)
;
select * from users;
select * from posts;
select posts.id, posts.user_id, users.name, posts.content from posts left join users on user_id = users.id;
select users.id, users.name, posts.id, posts.user_id, posts.content from users right join posts on users.id = posts.user_id;
EOF
