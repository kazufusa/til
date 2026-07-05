import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ask, banner } from "../lib/llm";

/**
 * Pattern 6: Durable workflow (checkpoint & resume)
 * Long-running orchestrations die: crashes, deploys, rate limits, Ctrl+C.
 * The AI SDK gives you async/parallel primitives but NO persistence — if the
 * process stops, everything is lost. Durability is the app's (or a workflow
 * engine's: Temporal, Inngest, Prefect...) job.
 *
 * Minimal version here: every completed step's output is checkpointed to a
 * JSON file; on restart, completed steps are skipped and the run resumes
 * exactly where it stopped.
 *
 *   bun run demo durable --crash   # simulates a crash after step 2
 *   bun run demo durable           # resumes: steps 1-2 replay from checkpoint
 *   bun run demo durable --reset   # clear the checkpoint and start over
 */

const CKPT_FILE = join(dirname(new URL(import.meta.url).pathname), "../../.checkpoint/durable.json");

type Checkpoint = Record<string, string>;

function loadCheckpoint(): Checkpoint {
  return existsSync(CKPT_FILE) ? JSON.parse(readFileSync(CKPT_FILE, "utf8")) : {};
}

function saveCheckpoint(ckpt: Checkpoint) {
  mkdirSync(dirname(CKPT_FILE), { recursive: true });
  writeFileSync(CKPT_FILE, JSON.stringify(ckpt, null, 2));
}

/** Run a step, or replay its result from the checkpoint if already done. */
async function step(ckpt: Checkpoint, name: string, fn: () => Promise<string>): Promise<string> {
  if (name in ckpt) {
    console.log(`  [${name}] resumed from checkpoint (0s, 0 tokens)`);
    return ckpt[name]!;
  }
  const result = await fn();
  ckpt[name] = result;
  saveCheckpoint(ckpt); // persist after EVERY step -> crash-safe
  return result;
}

const TOPIC = "why local LLMs matter for developer tooling";

export async function durable() {
  banner("Pattern 6: Durable workflow (checkpoint & resume)");

  const flag = process.argv[3];
  if (flag === "--reset") {
    rmSync(CKPT_FILE, { force: true });
    console.log("checkpoint cleared");
    return;
  }
  const crash = flag === "--crash";

  const ckpt = loadCheckpoint();
  const done = Object.keys(ckpt).length;
  console.log(done > 0 ? `resuming: ${done} step(s) already checkpointed` : "fresh run");

  const outline = await step(ckpt, "1-outline", () =>
    ask("1-outline", {
      system: "Reply with a 3-point outline as a numbered list, nothing else.",
      prompt: `Outline a short blog post: "${TOPIC}"`,
    }),
  );

  const intro = await step(ckpt, "2-intro", () =>
    ask("2-intro", {
      system: "You write engaging blog intros. Reply with the paragraph only (<=80 words).",
      prompt: `Write the intro for a post titled "${TOPIC}" with this outline:\n${outline}`,
    }),
  );

  if (crash) {
    console.log("\n!!! simulated crash after step 2 (checkpoint is on disk) !!!");
    console.log("run again without --crash to resume from step 3");
    process.exit(1);
  }

  const body = await step(ckpt, "3-body", () =>
    ask("3-body", {
      system: "You write concise technical blog sections. Reply with the body only (<=200 words).",
      prompt: `Write the body for "${TOPIC}".\nOutline:\n${outline}\nIntro:\n${intro}`,
    }),
  );

  const tldr = await step(ckpt, "4-tldr", () =>
    ask("4-tldr", {
      system: "Reply with a single TL;DR sentence.",
      prompt: `Summarize this post:\n${intro}\n${body}`,
    }),
  );

  console.log(`\n--- post ---\n${intro}\n\n${body}\n\nTL;DR: ${tldr}`);

  rmSync(CKPT_FILE, { force: true }); // workflow finished -> checkpoint no longer needed
  console.log("\nworkflow complete, checkpoint removed");
}
