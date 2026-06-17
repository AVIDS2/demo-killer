export { runCli } from "./cli.js";
export { buildInventory } from "./inventory.js";
export { buildJsonReport } from "./report/json.js";
export { renderMarkdownReport } from "./report/markdown.js";
export { resolveRepository } from "./repository.js";
export { analyzeFindings } from "./rules/index.js";
export { inspectRouteSource } from "./source-inspector.js";
export { diffSnapshots } from "./state.js";
export type { AnalysisReport, Evidence, Finding, Verdict } from "./types.js";
