## Next.js next/image on Docker cann't optimize image

| Software  | Version   |
|-----------|-----------|
| Next.js   | 13.3.0    |
| Node.js   | 18        |

Next.js@13.2.4 works well.

```typescript
        <Image
          src="/sample.png"
          alt="sample"
          className="dark:invert"
          width={100}
          height={24}
          priority
        />
```

```
docker container run --rm -p 3001:3000 next
Listening on port 3000 url: http://0a213b0d637a:3000
Error: Cannot find module 'next/dist/compiled/jest-worker'
Require stack:
- /app/node_modules/next/dist/server/lib/squoosh/main.js
- /app/node_modules/next/dist/server/image-optimizer.js
- /app/node_modules/next/dist/server/next-server.js
- /app/server.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1075:15)
    at mod._resolveFilename (/app/node_modules/next/dist/build/webpack/require-hook.js:23:32)
    at Module._load (node:internal/modules/cjs/loader:920:27)
    at Module.require (node:internal/modules/cjs/loader:1141:19)
    at require (node:internal/modules/cjs/helpers:110:18)
    at Object.<anonymous> (/app/node_modules/next/dist/server/lib/squoosh/main.js:8:19)
    at Module._compile (node:internal/modules/cjs/loader:1254:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1308:10)
    at Module.load (node:internal/modules/cjs/loader:1117:32)
    at Module._load (node:internal/modules/cjs/loader:958:12) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [
    '/app/node_modules/next/dist/server/lib/squoosh/main.js',
    '/app/node_modules/next/dist/server/image-optimizer.js',
    '/app/node_modules/next/dist/server/next-server.js',
    '/app/server.js'
  ]
}
```

https://github.com/vercel/next.js/issues/48173
