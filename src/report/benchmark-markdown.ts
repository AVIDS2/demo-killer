import type { BenchmarkSuiteResult } from "../benchmark-runner.js";

function formatRuleIds(ruleIds: string[]): string {
  return ruleIds.length === 0 ? "-" : ruleIds.join(", ");
}

export function renderBenchmarkMarkdown(result: BenchmarkSuiteResult): string {
  const archetypes = [...new Set(result.results.map((item) => item.sample.archetype))].sort();
  const matches = result.results.filter((item) => item.status === "match").length;
  const mismatches = result.results.filter((item) => item.status === "mismatch").length;
  const errors = result.results.filter((item) => item.status === "error").length;
  const rows = result.results.map((item) => {
    const notes = item.error ?? formatRuleIds(item.actualRuleIds);
    return `| ${item.sample.name} | ${item.sample.archetype} | ${item.status} | ${item.expectedVerdict} | ${item.actualVerdict ?? "-"} | ${notes} |`;
  });

  return [
    "# Demo Killer Benchmark",
    "",
    `Total samples: ${result.results.length}`,
    `Archetypes: ${archetypes.join(", ")}`,
    `Matches: ${matches}`,
    `Mismatches: ${mismatches}`,
    `Errors: ${errors}`,
    "",
    "| Sample | Archetype | Status | Expected | Actual | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
