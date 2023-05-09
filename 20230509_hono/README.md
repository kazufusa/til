## Simple Web API with Hono

```sh
yarn && yarn start
```

```sh
% curl -i -X POST --data '{"name": "AAA", "age": 13}' localhost:8081/test
HTTP/1.1 200 OK
content-type: application/json; charset=UTF-8
Content-Length: 25
Date: Tue, 09 May 2023 14:04:42 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"text":"Hello AAA(13)!"}%
```
