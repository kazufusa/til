import { z } from "zod";
import { ask, askObject, banner } from "../lib/llm";

/**
 * Pattern 4: Orchestrator-workers
 * Unlike parallelization, the subtasks are NOT known upfront: an orchestrator
 * LLM call decides how to decompose the task, workers execute the dynamic
 * subtasks, and a synthesizer merges the results.
 */

const Plan = z.object({
  subtasks: z
    .array(
      z.object({
        title: z.string(),
        instruction: z.string().describe("one-sentence instruction for a worker"),
      }),
    )
    .min(2)
    .max(4),
});

const TASK =
  "Create a one-page product brief for 'focusctl', a terminal-based pomodoro timer for developers.";

export async function orchestratorWorkers() {
  banner("Pattern 4: Orchestrator-workers (plan -> workers -> synthesize)");
  console.log(`task: ${TASK}`);

  // 1. orchestrator decomposes the task dynamically
  const plan = await askObject("orchestrator", Plan, {
    system: "You are a project orchestrator. Break the task into 2-4 independent writing subtasks.",
    prompt: TASK,
  });
  console.log("\n--- plan ---");
  plan.subtasks.forEach((s, i) => console.log(`  ${i + 1}. ${s.title}: ${s.instruction}`));

  // 2. workers execute subtasks concurrently
  const results = await Promise.all(
    plan.subtasks.map((s, i) =>
      ask(`worker:${i + 1}`, {
        system: "You are a concise technical writer. Reply with the requested section only (<=120 words).",
        prompt: `Overall task: ${TASK}\nYour subtask: ${s.instruction}`,
        maxOutputTokens: 300,
      }).then((text) => ({ title: s.title, text })),
    ),
  );

  // 3. synthesizer merges worker outputs
  const brief = await ask("synthesizer", {
    system: "You merge sections into one coherent product brief in markdown. Keep it tight, no repetition.",
    prompt: results.map((r) => `## ${r.title}\n${r.text}`).join("\n\n"),
    maxOutputTokens: 700,
  });
  console.log(`\n--- final brief ---\n${brief}`);
}
