create table Address (
  id int unsigned primary key not null auto_increment,
  name text,
  gender text,
  age int
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

insert into Address (name, gender, age) values
  ('小川',   '男', 30),
  ('前田',   '女', 21),
  ('森',     '男', 45),
  ('林',     '男', 32),
  ('井上',   '女', 55),
  ('佐々木', '女', 19),
  ('松本',   '女', 20),
  ('佐藤',   '女', 25),
  ('鈴木',   '男', 32)
;
