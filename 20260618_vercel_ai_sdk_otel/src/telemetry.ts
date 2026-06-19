import { NodeSDK, tracing, metrics } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { metrics as metricsApi } from "@opentelemetry/api";
import { TraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { MetricExporter } from "@google-cloud/opentelemetry-cloud-monitoring-exporter";

// アプリ識別子。複数アプリが同じ gen_ai.client.token.usage メトリクスへ
// 書くため、これを metric ラベルに付けてアプリ単位で区別・集計できるようにする。
// OTEL_SERVICE_NAME で上書き可 (アプリごとに変える)。
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "vercel-ai-sdk-otel";

// OTEL_TARGET=gcp なら Cloud Trace / Cloud Monitoring へ、
// それ以外 (デフォルト console) はローカル確認用に標準出力へ出す。
const target = process.env.OTEL_TARGET === "gcp" ? "gcp" : "console";
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT_ID;

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: "0.1.0",
});

const traceExporter =
  target === "gcp"
    ? new TraceExporter({ projectId })
    : new tracing.ConsoleSpanExporter();

const metricExporter =
  target === "gcp"
    ? new MetricExporter({ projectId })
    : new metrics.ConsoleMetricExporter();

const metricReader = new metrics.PeriodicExportingMetricReader({
  exporter: metricExporter,
  // Cloud Monitoring は同一時系列を頻繁に書けないので余裕を持たせる。
  exportIntervalMillis: target === "gcp" ? 60_000 : 5_000,
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReaders: [metricReader],
});

// token 使用量を Cloud Monitoring のメトリクスとして記録するためのカウンタ。
// counter は MeterProvider が global 登録された後 (sdk.start 後) に生成しないと
// どの reader にも紐づかず export されないため、遅延生成する。
let tokenCounter: ReturnType<ReturnType<typeof metricsApi.getMeter>["createCounter"]>;

export function startTelemetry(): void {
  sdk.start();
  tokenCounter = metricsApi.getMeter(SERVICE_NAME).createCounter(
    "gen_ai.client.token.usage",
    { description: "LLM が消費した token 数", unit: "{token}" },
  );
  console.error(`[otel] started (target=${target}, project=${projectId ?? "-"})`);
}

export async function stopTelemetry(): Promise<void> {
  // 終了前に残りの span / metric を必ず flush する。
  await sdk.shutdown();
}

export function recordTokenUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  model: string;
}): void {
  // service.name でアプリを区別。これが無いと別アプリと同一時系列に衝突する。
  const attrs = {
    "service.name": SERVICE_NAME,
    "gen_ai.request.model": usage.model,
  };
  if (usage.inputTokens != null) {
    tokenCounter.add(usage.inputTokens, { ...attrs, "gen_ai.token.type": "input" });
  }
  if (usage.outputTokens != null) {
    tokenCounter.add(usage.outputTokens, { ...attrs, "gen_ai.token.type": "output" });
  }
}
