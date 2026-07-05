import { ask, banner } from "../lib/llm";

/**
 * Pattern 1: Prompt chaining
 * Decompose a task into fixed sequential steps; each LLM call consumes the
 * previous call's output. A programmatic "gate" between steps catches bad
 * intermediate output early (here: tweet length check with one retry).
 */
export async function chaining() {
  banner("Pattern 1: Prompt chaining (announcement -> key points -> tweet -> Japanese)");

  const announcement = `
Today we are releasing OrchestKit 1.0, an open-source TypeScript library for
building multi-step LLM workflows. It ships with retry handling, structured
outputs, and pluggable model providers, and runs fully offline against local
models via Ollama. MIT licensed, zero runtime dependencies.`;

  // step 1: extract key points
  const points = await ask("extract", {
    system: "You extract key facts. Reply with a plain bullet list only.",
    prompt: `Extract the 3 most important points from this announcement:\n${announcement}`,
  });
  console.log(`\n--- key points ---\n${points}`);

  // step 2: write a tweet, with a programmatic gate + one retry
  let tweet = await ask("tweet", {
    system: "You write concise launch tweets. Reply with the tweet text only, no hashtags spam, max 280 characters.",
    prompt: `Write a launch tweet based on these points:\n${points}`,
  });
  if (tweet.length > 280) {
    console.log(`  [gate] tweet too long (${tweet.length} chars) -> retry`);
    tweet = await ask("tweet-retry", {
      system: "You write concise launch tweets. Reply with the tweet text only, max 280 characters.",
      prompt: `Shorten this tweet to under 280 characters, keep the substance:\n${tweet}`,
    });
  } else {
    console.log(`  [gate] tweet length OK (${tweet.length} chars)`);
  }
  console.log(`\n--- tweet ---\n${tweet}`);

  // step 3: translate
  const ja = await ask("translate", {
    system: "You are a professional English-to-Japanese translator. Reply with the translation only.",
    prompt: `Translate this tweet into natural Japanese:\n${tweet}`,
  });
  console.log(`\n--- 日本語 ---\n${ja}`);
}
