# GraphQL Mock with Typescript

```sh
$ npx gts init -y
$ curl https://github.com/github/gitignore/blob/main/Node.gitignore > .gitignore
$ : edit tsconfig.json
$ git diff tsconfig.json
diff --git a/20220806_graphql_mock/tsconfig.json b/20220806_graphql_mock/tsconfig.json
index d1646f0..d7c6330 100644
--- a/20220806_graphql_mock/tsconfig.json
+++ b/20220806_graphql_mock/tsconfig.json
@@ -2,7 +2,8 @@
   "extends": "./node_modules/gts/tsconfig-google.json",
   "compilerOptions": {
     "rootDir": ".",
-    "outDir": "build"
+    "outDir": "build",
+    "esModuleInterop": true
   },
   "include": [
     "src/**/*.ts",
$ yarn add apollo-server graphql
$ yarn add -D ts-node ts-node-dev
$ : edit src/index.ts
$ yarn dev
$ : open http://localhost:4000/
```

##

```sh
$ yarn add @graphql-tools/load @graphql-tools/schema @graphql-tools/graphql-file-loader
$ : fix src/index.ts
$ : open http://localhost:4000/ or query with curl
$ curl -s --request POST \
  --header 'content-type: application/json' \
  --url http://localhost:4000/ \
  --data '{"query":"query { books {author title} }"}' | jq
{
  "data": {
    "books": [
      {
        "author": "Kate Chopin",
        "title": "The Awakening"
      },
      {
        "author": "Paul Auster",
        "title": "City of Glass"
      }
    ]
  }
}
```

## Sample query

```graphql
query {
  books {
    author
    __typename
    title
  }
}
```

## References

- https://zenn.dev/intercept6/articles/3daca0298d32d8022e71
