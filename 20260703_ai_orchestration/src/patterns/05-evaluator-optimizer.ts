import { z } from "zod";
import { ask, askObject, banner } from "../lib/llm";

/**
 * Pattern 5: Evaluator-optimizer
 * A generator produces a draft, an evaluator scores it against explicit
 * criteria, and the feedback loops back into the generator until the draft
 * passes or the iteration budget runs out.
 */

// NOTE: a numeric 0-10 score was tried first, but qwen3:4b used the scale
// inconsistently ("fully meets brief" -> score=1). Small models handle
// categorical judgements far more reliably than numeric scales.
const Evaluation = z.object({
  verdict: z.enum(["pass", "fail"]).describe("pass only if EVERY constraint of the brief is satisfied"),
  feedback: z.string().describe("the single most important improvement"),
});

const BRIEF =
  "A tagline for 'focusctl', a terminal pomodoro timer for developers. Max 8 words. Must mention the terminal or CLI. No clichés like 'unleash' or 'supercharge'.";

const MAX_ITERS = 3;

export async function evaluatorOptimizer() {
  banner("Pattern 5: Evaluator-optimizer (generate <-> critique loop)");
  console.log(`brief: ${BRIEF}`);

  let draft = "";
  let feedback = "";

  for (let i = 1; i <= MAX_ITERS; i++) {
    draft = await ask(`generate#${i}`, {
      system: "You are a copywriter. Reply with the tagline only.",
      prompt: feedback
        ? `Brief: ${BRIEF}\nPrevious attempt: ${draft}\nEvaluator feedback: ${feedback}\nWrite an improved tagline.`
        : `Brief: ${BRIEF}`,
      maxOutputTokens: 60,
    });
    console.log(`\n  draft #${i}: "${draft}"`);

    const evaluation = await askObject(`evaluate#${i}`, Evaluation, {
      system: "You are a strict brand copy evaluator. Judge ONLY against the brief's constraints.",
      prompt: `Brief: ${BRIEF}\nTagline: ${draft}`,
    });
    console.log(`  eval #${i}: ${evaluation.verdict} — ${evaluation.feedback}`);

    if (evaluation.verdict === "pass") {
      console.log(`\n--- accepted after ${i} iteration(s) ---\n"${draft}"`);
      return;
    }
    feedback = evaluation.feedback;
  }
  console.log(`\n--- iteration budget exhausted, best effort ---\n"${draft}"`);
}
