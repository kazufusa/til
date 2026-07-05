import { ask, banner } from "../lib/llm";

/**
 * Pattern 3: Parallelization (sectioning)
 * Independent perspectives run concurrently (Promise.all), then one
 * aggregation call merges them. Wall-clock = slowest branch, not the sum.
 * Note: Ollama serializes requests per loaded model by default, so the speedup
 * shows up against remote APIs or with OLLAMA_NUM_PARALLEL > 1.
 */

const CODE = `
function getUser(req, res) {
  const id = req.query.id;
  db.query("SELECT * FROM users WHERE id = " + id, (err, rows) => {
    res.send(rows[0]);
  });
}`;

const REVIEWERS = [
  { name: "security", focus: "security vulnerabilities (injection, auth, data exposure)" },
  { name: "reliability", focus: "error handling, edge cases, crashes" },
  { name: "readability", focus: "naming, structure, maintainability" },
];

export async function parallel() {
  banner("Pattern 3: Parallelization (3 reviewers -> aggregate)");
  console.log(`reviewing:\n${CODE}`);

  const reviews = await Promise.all(
    REVIEWERS.map((r) =>
      ask(`review:${r.name}`, {
        system: `You are a code reviewer focused ONLY on ${r.focus}. List at most 3 findings as short bullets.`,
        prompt: `Review this JavaScript code:\n${CODE}`,
        maxOutputTokens: 300,
      }).then((text) => ({ name: r.name, text })),
    ),
  );

  for (const r of reviews) {
    console.log(`\n--- ${r.name} ---\n${r.text}`);
  }

  const summary = await ask("aggregate", {
    system:
      "You merge code review feedback into at most 5 deduplicated findings, ranked by severity. Output a compact numbered list, one line per finding, no preamble.",
    prompt: reviews.map((r) => `## ${r.name}\n${r.text}`).join("\n\n"),
    maxOutputTokens: 400,
  });
  console.log(`\n--- aggregated review ---\n${summary}`);
}
