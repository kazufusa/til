import { z } from "zod";
import { ask, askObject, banner } from "../lib/llm";

/**
 * Pattern 2: Routing
 * A cheap classifier call picks the category, then the input is handled by a
 * specialized prompt for that category. Separation of concerns: each handler
 * prompt can be optimized independently.
 */

const Route = z.object({
  category: z.enum(["refund", "technical", "general"]),
  reason: z.string(),
});

const HANDLERS: Record<z.infer<typeof Route>["category"], string> = {
  refund:
    "You are a billing support agent. Be empathetic, state the refund policy (30 days, full refund), and give concrete next steps.",
  technical:
    "You are a senior support engineer. Give a numbered troubleshooting checklist, most likely cause first.",
  general:
    "You are a friendly support agent. Answer briefly and point to relevant resources.",
};

const QUERIES = [
  "I bought the pro plan yesterday but it's not what I expected. Can I get my money back?",
  "The app crashes with 'ECONNREFUSED 127.0.0.1:11434' every time I start a workflow.",
  "Do you have a community Discord or forum?",
];

export async function routing() {
  banner("Pattern 2: Routing (classify -> specialized handler)");

  for (const query of QUERIES) {
    console.log(`\n>>> query: ${query}`);

    const route = await askObject("classify", Route, {
      system: "Classify the customer message into exactly one category.",
      prompt: query,
    });
    console.log(`  [router] -> ${route.category} (${route.reason})`);

    const answer = await ask(`handle:${route.category}`, {
      system: HANDLERS[route.category],
      prompt: query,
      maxOutputTokens: 300,
    });
    console.log(`--- answer ---\n${answer}`);
  }
}
