# sqlite3 ring buffer table

```sh
$ bash test.sh
900|test 25337
901|test 31991
902|test 22360
903|test 10683
904|test 9595
(omitted)
996|test 23484
997|test 5259
998|test 19228
999|test 499
1000|test 32545
$ bash test.sh
1900|test 15801
1901|test 23589
1902|test 10327
1903|test 4285
1904|test 17630
(omitted)
1996|test 8379
1997|test 28496
1998|test 5866
1999|test 2924
2000|test 7415
$ echo .schema | sqlite3 test.sqlite3
CREATE TABLE ring_buffer (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TRIGGER delete_tail AFTER INSERT ON ring_buffer
BEGIN
    DELETE FROM ring_buffer where id < NEW.id-100;
END;
```

- reference: https://gist.github.com/elyezer/6450054#gistcomment-3789954
