import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, generateText } from "ai";
import type { ModelMessage } from "ai";
import type { z } from "zod";

const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  // Ollama >= 0.5 supports response_format json_schema on /v1
  supportsStructuredOutputs: true,
});

// non-thinking variant: on CPU, thinking models burn minutes of reasoning per call
export const MODEL_ID = process.env.MODEL ?? "qwen3:4b-instruct";
export const model = ollama.chatModel(MODEL_ID);

// ---- step logging -----------------------------------------------------------

const totals = { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 };

function record(label: string, usage: { inputTokens?: number; outputTokens?: number }, t0: number) {
  const ms = performance.now() - t0;
  totals.calls += 1;
  totals.inputTokens += usage.inputTokens ?? 0;
  totals.outputTokens += usage.outputTokens ?? 0;
  totals.ms += ms;
  console.log(
    `  [${label}] ${(ms / 1000).toFixed(1)}s  in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} tokens`,
  );
}

export function printTotals() {
  console.log(
    `\n== totals: ${totals.calls} LLM calls, in=${totals.inputTokens} out=${totals.outputTokens} tokens, ${(totals.ms / 1000).toFixed(1)}s LLM time ==`,
  );
}

export function banner(title: string) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}

// ---- LLM call helpers -------------------------------------------------------

/** Plain-text LLM call with timing/token logging. */
export async function ask(
  label: string,
  opts: { system?: string; prompt: string; maxOutputTokens?: number },
): Promise<string> {
  const t0 = performance.now();
  const res = await generateText({ model, maxOutputTokens: 1024, ...opts });
  record(label, res.usage, t0);
  return res.text.trim();
}

/**
 * Conversation-history LLM call: the caller owns the messages array.
 * This is what makes an agent session serializable — persist the messages,
 * and the "agent" can be killed and revived in another process later.
 */
export async function askChat(
  label: string,
  // NB: AI SDK v7 rejects system-role entries inside `messages` — system goes separately
  opts: { system?: string; messages: ModelMessage[]; maxOutputTokens?: number },
): Promise<string> {
  const t0 = performance.now();
  const res = await generateText({ model, maxOutputTokens: 1024, ...opts });
  record(label, res.usage, t0);
  return res.text.trim();
}

/**
 * Structured-output LLM call (zod schema) with timing/token logging.
 * Small local models occasionally emit schema-violating JSON — one bad
 * response must not kill a whole workflow, so retry up to 3 attempts.
 */
export async function askObject<S extends z.ZodType>(
  label: string,
  schema: S,
  opts: { system?: string; prompt: string },
): Promise<z.infer<S>> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    const t0 = performance.now();
    try {
      const res = await generateObject({ model, schema, ...opts });
      record(label, res.usage, t0);
      return res.object as z.infer<S>;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.log(`  [${label}] invalid structured output (attempt ${attempt}/${MAX_ATTEMPTS}) -> retry`);
    }
  }
}
