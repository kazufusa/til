# SQL: Window

```sh
$ docker run --rm --name some-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -e MYSQL_DATABASE=database -d mysql:8.0
$ mysql -uroot -pmy-secret-pw --protocol tcp -D database
mysql>
```


```sql
mysql> create table Address (
  id int unsigned primary key not null auto_increment,
  name text,
  gender text,
  age int
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

Query OK, 0 rows affected (0.07 sec)

mysql> insert into Address (name, gender, age) values
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
Query OK, 9 rows affected (0.01 sec)
Records: 9  Duplicates: 0  Warnings: 0

mysql> select * from Address;
+----+-----------+--------+------+
| id | name      | gender | age  |
+----+-----------+--------+------+
|  1 | 小川      | 男     |   30 |
|  2 | 前田      | 女     |   21 |
|  3 | 森        | 男     |   45 |
|  4 | 林        | 男     |   32 |
|  5 | 井上      | 女     |   55 |
|  6 | 佐々木    | 女     |   19 |
|  7 | 松本      | 女     |   20 |
|  8 | 佐藤      | 女     |   25 |
|  9 | 鈴木      | 男     |   32 |
+----+-----------+--------+------+
9 rows in set (0.00 sec)

mysql> select
  name,
  gender,
  age,
  Rank() over(partition by gender order by age desc) as rnk
from Address;
+-----------+--------+------+-----+
| name      | gender | age  | rnk |
+-----------+--------+------+-----+
| 井上      | 女     |   55 |   1 |
| 佐藤      | 女     |   25 |   2 |
| 前田      | 女     |   21 |   3 |
| 松本      | 女     |   20 |   4 |
| 佐々木    | 女     |   19 |   5 |
| 森        | 男     |   45 |   1 |
| 林        | 男     |   32 |   2 |
| 鈴木      | 男     |   32 |   2 |
| 小川      | 男     |   30 |   4 |
+-----------+--------+------+-----+
9 rows in set (0.00 sec)
```
