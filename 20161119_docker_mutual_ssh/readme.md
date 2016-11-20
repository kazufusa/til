# Interconnectable containers

```
$ docker-compose build
$ docker-compose up -d
$ docker-compose exec --user user master bash
[user@*****(master) ~]$ ssh node1 # no password, no passphrase, and no host checking
[user@******(node1) ~]$ ssh master # no password, no passphrase, and no host checking
[user@*****(master) ~]$ exit
[user@******(node1) ~]$ exit
[user@*****(master) ~]$ exit
$ docker-compose stop
$ docker-compose rm -fa
```
