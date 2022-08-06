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
```
