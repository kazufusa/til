# GraphQL server for dev

```sh
$ node_modules/.bin/json-graphql-server db.js &
GraphQL server running with your data at http://localhost:3000/
$ sh ./test.sh
+ curl http://localhost:3000 -s -X POST -H Content-Type: application/json+  -d { "query": "{ Post(id: 1) { title views user_id} }" }
jq .
{
  "data": {
    "Post": {
      "title": "Lorem Ipsum",
      "views": 254,
      "user_id": "123"
    }
  }
}
+ curl http://localhost:3000 -s -X POST -H Content-Type: application/json -d { "query": "{ allUsers { id name } }" }
+ jq .
{
  "data": {
    "allUsers": [
      {
        "id": "123",
        "name": "John Doe"
      },
      {
        "id": "456",
        "name": "Jane Doe"
      }
    ]
  }
}
```
