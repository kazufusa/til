# golang file uploader

```sh
$ go run ./main.go & # start file uploader(localhost:8080/upload)
$ ls ./uploaded
$ date >| A.txt
$ curl -X POST -F "name=A.txt" -F "file=@A.txt" localhost:8080/upload
$ ls ./uploaded
A.txt
```
