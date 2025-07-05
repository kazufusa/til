import { Inspectable, Effect, LogLevel, Logger } from "effect";

const fixedAnnotations = {
  projectId: "my-gcp-project",
  env: "production",
  serviceName: "my-service",
};

const mapToCloudSeverity = (level: string): string => {
  switch (level) {
    case "ALL":
      return "DEFAULT";
    case "TRACE":
      return "DEBUG";
    case "DEBUG":
      return "DEBUG";
    case "INFO":
      return "INFO";
    case "WARNING":
      return "WARNING";
    case "ERROR":
      return "ERROR";
    case "FATAL":
      return "CRITICAL";
    case "NONE":
      return "DEFAULT";
    default:
      return "DEFAULT";
  }
};

const customJsonLogger = Logger.map(Logger.structuredLogger, (entry) => ({
  ...entry,
  logLevel: undefined,
  severity: mapToCloudSeverity(entry.logLevel),
  hogehoge: "fugfuga",
  annotations: {
    ...fixedAnnotations,
    ...entry.annotations,
  },
}));

const loggerWithConsoleLog = (logger) =>
  Logger.map(logger, (entry) => {
    globalThis.console.log(Inspectable.stringifyCircular(entry));
    return entry;
  });

function getLogLayer() {
  return Logger.replace(
    Logger.defaultLogger,
    loggerWithConsoleLog(customJsonLogger),
  );
}

const task1 = Effect.gen(function* () {
  yield* Effect.sleep("2 seconds");
  yield* Effect.logDebug("task1 done");
});

const task2 = Effect.gen(function* () {
  yield* Effect.sleep("1 second");
  yield* Effect.logDebug("task2 done");
});

const program = Effect.gen(function* () {
  yield* Effect.log("start");
  yield* task1;
  yield* task2;
  yield* Effect.log("done");
});

Effect.runFork(
  program.pipe(
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.provide(getLogLayer()),
  ),
);
