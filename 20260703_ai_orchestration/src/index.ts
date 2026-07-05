import { MODEL_ID, printTotals } from "./lib/llm";
import { chaining } from "./patterns/01-chaining";
import { routing } from "./patterns/02-routing";
import { parallel } from "./patterns/03-parallel";
import { orchestratorWorkers } from "./patterns/04-orchestrator-workers";
import { evaluatorOptimizer } from "./patterns/05-evaluator-optimizer";
import { durable } from "./patterns/06-durable";
import { suspendResume } from "./patterns/07-suspend-resume";

const PATTERNS: Record<string, () => Promise<void>> = {
  chaining,
  routing,
  parallel,
  orchestrator: orchestratorWorkers,
  evaluator: evaluatorOptimizer,
  durable,
  suspend: suspendResume,
};

const arg = process.argv[2];
const valid = arg === "all" || (arg !== undefined && arg in PATTERNS);

if (!valid) {
  console.log(`AI orchestration patterns demo (local LLM via Ollama, model: ${MODEL_ID})

usage: bun run demo <pattern>

patterns:
  chaining      1. prompt chaining      — sequential steps + gate
  routing       2. routing              — classify, then specialized handler
  parallel      3. parallelization      — concurrent branches + aggregate
  orchestrator  4. orchestrator-workers — dynamic decomposition
  evaluator     5. evaluator-optimizer  — generate/critique loop
  durable       6. durable workflow     — checkpoint & resume (--crash / --reset)
  suspend       7. suspend & resume     — delegate to subagent, die, revive (start | worker | status | reset)
  all           run all patterns in order`);
  process.exit(arg ? 1 : 0);
}

const toRun = arg === "all" ? Object.values(PATTERNS) : [PATTERNS[arg]!];
for (const pattern of toRun) {
  await pattern();
}
printTotals();
