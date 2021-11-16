# sqlite3 and free-list behavior

```sh
$ sh ./main.sh
# initial
8.0K main.sqlite3
# insert
16K main.sqlite3
# delete all records
16K main.sqlite3
# insert
16K main.sqlite3
# insert
20K main.sqlite3
# delete all records
20K main.sqlite3
# insert
20K main.sqlite3
# delete all records
20K main.sqlite3
# insert
20K main.sqlite3
# insert
20K main.sqlite3
# insert
28K main.sqlite3
# insert
32K main.sqlite3
# insert
40K main.sqlite3
```

# official document

https://www.sqlite.org/faq.html

> (12) I deleted a lot of data but the database file did not get any smaller. Is this a bug?
> 
> No. When you delete information from an SQLite database, the unused disk space is added to an internal "free-list" and is reused the next time you insert data. The disk space is not lost. But neither is it returned to the operating system.
> 
> If you delete a lot of data and want to shrink the database file, run the VACUUM command. VACUUM will reconstruct the database from scratch. This will leave the database with an empty free-list and a file that is minimal in size. Note, however, that the VACUUM can take some time to run (around a half second per megabyte on the Linux box where SQLite is developed) and it can use up to twice as much temporary disk space as the original file while it is running.
> 
> As of SQLite version 3.1, an alternative to using the VACUUM command is auto-vacuum mode, enabled using the auto_vacuum pragma.
