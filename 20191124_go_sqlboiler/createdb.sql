drop table users;
drop table todo;
create table if not exists users (
  id integer primary key autoincrement,
  name text not null
);

create table if not exists todo (
  id integer primary key autoincrement,
  user_id integer,
  title text not null,
  note text,
  finished boolean not null,
  due_date datetime,
  foreign key(user_id) references users(id)
);

