import { vertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";
import { startTelemetry, stopTelemetry, recordTokenUsage } from "./telemetry";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

async function main() {
  startTelemetry();

  const prompt =
    process.argv.slice(2).join(" ") ||
    "OpenTelemetry を一文で説明して。";

  const result = await generateText({
    model: vertex(MODEL),
    prompt,
    // AI SDK の span を OTel に流す。span 名は ai.* で出力される。
    experimental_telemetry: {
      isEnabled: true,
      functionId: "demo-generate-text",
      metadata: { prompt },
    },
  });

  console.log("\n--- 応答 ---");
  console.log(result.text);

  console.log("\n--- token usage ---");
  console.log(`input : ${result.usage.inputTokens}`);
  console.log(`output: ${result.usage.outputTokens}`);
  console.log(`total : ${result.usage.totalTokens}`);

  // span 属性とは別に、可視化しやすいようメトリクスとしても記録する。
  recordTokenUsage({
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    model: MODEL,
  });

  // PeriodicExportingMetricReader が flush するのを待ってから終了。
  await stopTelemetry();
}

main().catch(async (err) => {
  console.error(err);
  await stopTelemetry().catch(() => {});
  process.exit(1);
});
