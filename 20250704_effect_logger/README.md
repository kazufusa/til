## Effect and custom logger

```sh
% node --experimental-strip-types --experimental-transform-types --experimental-detect-module --no-warnings=ExperimentalWarning structured.ts
{"message":"start","timestamp":"2025-07-05T15:30:27.130Z","annotations":{"projectId":"my-gcp-project","env":"production","serviceName":"my-service"},"spans":{},"fiberId":"#0","severity":"INFO","hogehoge":"fugfuga"}
{"message":"task1 done","timestamp":"2025-07-05T15:30:29.135Z","annotations":{"projectId":"my-gcp-project","env":"production","serviceName":"my-service"},"spans":{},"fiberId":"#0","severity":"DEBUG","hogehoge":"fugfuga"}
{"message":"task2 done","timestamp":"2025-07-05T15:30:30.137Z","annotations":{"projectId":"my-gcp-project","env":"production","serviceName":"my-service"},"spans":{},"fiberId":"#0","severity":"DEBUG","hogehoge":"fugfuga"}
{"message":"done","timestamp":"2025-07-05T15:30:30.139Z","annotations":{"projectId":"my-gcp-project","env":"production","serviceName":"my-service"},"spans":{},"fiberId":"#0","severity":"INFO","hogehoge":"fugfuga"}
```
