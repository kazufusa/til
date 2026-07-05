import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { ask, askChat, askObject, banner } from "../lib/llm";

/**
 * Pattern 7: Suspend & resume (agent handoff to a slow subagent)
 * The missing piece after pattern 6: cross-process async.
 *
 *   1. `start`  — the parent agent plans, delegates a multi-minute research
 *                 task to a subagent, serializes its OWN session (the full
 *                 messages array) to disk, and EXITS. The agent is dead.
 *   2. `worker` — a separate process picks up the job, runs the subagent
 *                 (several LLM calls, takes minutes), then REVIVES the parent:
 *                 loads the session, injects the subagent's report into the
 *                 conversation history, and the parent finishes its goal.
 *
 * The key insight: an "agent session" is just its messages array. Persist
 * that, and stop/revive across processes becomes trivial. This is exactly
 * what agent frameworks' session stores / durable execution engines do.
 *
 *   bun run demo suspend start    # parent plans, delegates, suspends, exits
 *   bun run demo suspend worker   # subagent runs, then parent is revived
 *   bun run demo suspend status   # inspect what's on disk
 *   bun run demo suspend reset    # clear all state
 */

const STATE_DIR = join(import.meta.dir, "../../.checkpoint/suspend");
const SESSION_FILE = join(STATE_DIR, "session.json");
const JOB_FILE = join(STATE_DIR, "job.json");

interface Session {
  goal: string;
  system: string;
  messages: ModelMessage[]; // the entire agent state (system prompt kept separately)
}

interface Job {
  instruction: string;
  status: "pending" | "done";
  report?: string;
}

function save(file: string, data: unknown) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function load<T>(file: string): T | undefined {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
}

const GOAL =
  "Write a short competitive-positioning memo for 'focusctl', a terminal pomodoro timer for developers.";

// ---- phase 1: parent agent plans, delegates, suspends ------------------------

const Plan = z.object({
  approach: z.string().describe("one paragraph: how you will structure the memo"),
  subagentInstruction: z
    .string()
    .describe("a self-contained research instruction for a subagent, one sentence"),
});

async function start() {
  if (load<Session>(SESSION_FILE)) {
    console.log("a suspended session already exists — run 'worker' to continue or 'reset' to discard");
    return;
  }
  console.log(`goal: ${GOAL}\n`);

  const plan = await askObject("parent:plan", Plan, {
    system:
      "You are the lead agent. Plan how to achieve the goal, and delegate the time-consuming market research to a subagent.",
    prompt: GOAL,
  });
  console.log(`--- plan ---\n${plan.approach}`);
  console.log(`--- delegated to subagent ---\n${plan.subagentInstruction}`);

  // serialize the parent's ENTIRE state: just the conversation so far
  const session: Session = {
    goal: GOAL,
    system: "You are the lead agent writing a competitive-positioning memo.",
    messages: [
      { role: "user", content: GOAL },
      {
        role: "assistant",
        content: `My plan: ${plan.approach}\nI delegated research to a subagent: "${plan.subagentInstruction}". I will write the memo once the research report arrives.`,
      },
    ],
  };
  save(SESSION_FILE, session);
  save(JOB_FILE, { instruction: plan.subagentInstruction, status: "pending" } satisfies Job);

  console.log("\n>>> session serialized to disk, job queued — parent agent process EXITS now");
  console.log(">>> run 'bun run demo suspend worker' (even after a reboot) to continue");
}

// ---- phase 2: subagent works (minutes), then the parent is revived -----------

const ASPECTS = ["GUI pomodoro apps", "existing CLI/terminal timers", "IDE-integrated focus tools"];

async function worker() {
  const job = load<Job>(JOB_FILE);
  const session = load<Session>(SESSION_FILE);
  if (!job || !session) {
    console.log("nothing to do — run 'bun run demo suspend start' first");
    return;
  }

  let report = job.report;
  if (job.status === "pending") {
    console.log(`subagent working on: ${job.instruction}\n`);

    // the slow part: research each competitor category, then synthesize
    const findings: string[] = [];
    for (const [i, aspect] of ASPECTS.entries()) {
      findings.push(
        await ask(`subagent:research#${i + 1}`, {
          system: "You are a market research subagent. Reply with 3 short factual bullets.",
          prompt: `${job.instruction}\nFocus on this competitor category: ${aspect}`,
          maxOutputTokens: 200,
        }),
      );
    }
    report = await ask("subagent:synthesize", {
      system: "You merge research notes into one structured report with headings. Be concise.",
      prompt: ASPECTS.map((a, i) => `## ${a}\n${findings[i]}`).join("\n\n"),
      maxOutputTokens: 500,
    });
    save(JOB_FILE, { ...job, status: "done", report } satisfies Job); // durable before revive
    console.log(`\n--- subagent report ready (${report.length} chars) ---`);
  } else {
    console.log("subagent report already done (recovered from disk) — reviving parent directly");
  }

  // ---- revive: restore session, inject the subagent output, continue ---------
  console.log("\n>>> reviving parent agent: restoring session + injecting subagent report\n");
  session.messages.push({
    role: "user",
    content: `The subagent finished. Research report:\n\n${report}\n\nNow write the final memo (markdown, <=250 words).`,
  });

  const memo = await askChat("parent:finish", {
    system: session.system ?? "You are the lead agent.",
    // filter guards sessions serialized before the system/messages split
    messages: session.messages.filter((m) => m.role !== "system"),
  });
  console.log(`--- final memo (written by the REVIVED parent) ---\n${memo}`);

  rmSync(STATE_DIR, { recursive: true, force: true });
  console.log("\ngoal achieved — session & job state cleaned up");
}

// ---- CLI ----------------------------------------------------------------------

export async function suspendResume() {
  banner("Pattern 7: Suspend & resume (delegate -> die -> revive with subagent output)");

  const cmd = process.argv[3] ?? "status";
  switch (cmd) {
    case "start":
      return start();
    case "worker":
      return worker();
    case "reset":
      rmSync(STATE_DIR, { recursive: true, force: true });
      console.log("state cleared");
      return;
    default: {
      const session = load<Session>(SESSION_FILE);
      const job = load<Job>(JOB_FILE);
      console.log(`session: ${session ? `suspended (${session.messages.length} messages)` : "none"}`);
      console.log(`job:     ${job ? job.status : "none"}`);
      console.log("\ncommands: start | worker | status | reset");
    }
  }
}
