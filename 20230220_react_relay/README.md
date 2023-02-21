# React Relay

## server

```
$ cd server && npx json-graphql-server db.js
GraphQL server running with your data at http://localhost:3000/
```

## Tips

### Get GraphQL schema

```sh
npx get-graphql-schema http://localhost:3000 > schema.graphql
```

### Use relay.config.json instead of relay.config.js

Using relay.config.js encounters ES_REQUIRE_ESM error and JSON format works correctly.

```sh
$ pnpm run relay

> vite-project@0.0.0 relay /home/kazufusa/src/github.com/kazufusa/til/20230220_react_relay/vite-project
> relay-compiler graphql/relay.config.js

[ERROR] Unable to initialize relay compiler configuration. Error details:
Error searching config: Invalid config file: "/home/kazufusa/src/github.com/kazufusa/til/20230220_react_relay/vite-project/graphql/relay.config.js": Error running node: node:internal/modules/cjs/loader:1156
      throw err;
      ^

Error [ERR_REQUIRE_ESM]: require() of ES Module /home/kazufusa/src/github.com/kazufusa/til/20230220_react_relay/vite-project/graphql/relay.config.js from /home/kazufusa/s
rc/github.com/kazufusa/til/20230220_react_relay/vite-project/[eval] not supported.
relay.config.js is treated as an ES module file as it is a .js file whose nearest parent package.json contains "type": "module" which declares all .js files in that package scope as ES modules.
Instead rename relay.config.js to end in .cjs, change the requiring code to use dynamic import() which is available in all CommonJS modules, or change "type": "module" to "type": "commonjs" in /home/kazufusa/src/github.com/kazufusa/til/20230220_react_relay/vite-project/package.json to treat all .js files as CommonJS (using .mjs for all ES modules instead).

    at [eval]:1:37
    at Script.runInThisContext (node:vm:129:12)
    at Object.runInThisContext (node:vm:305:38)
    at [eval]-wrapper:6:22 {
  code: 'ERR_REQUIRE_ESM'
}
```
