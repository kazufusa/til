# json-graphql-server

## Start server

```sh
$ npx json-graphql-server db.js
```

## Test request

```sh
$ curl 'http://localhost:3000/' \
  -H 'Content-Type: application/json' \
  -s \
  -d '{"query":"query {  Post(id:1){id User { id name}}}"}' \
  | jq .

{
  "data": {
    "Post": {
      "id": "1",
      "User": {
        "id": "123",
        "name": "John Doe"
      }
    }
  }
}
```
