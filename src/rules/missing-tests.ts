import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";

export function missingTestsRule(inventory: ProjectInventory): Finding[] {
  if (inventory.hasTests) return [];
  // Only fire for recognized stacks with actual code
  if (inventory.stack === "unknown" && inventory.apiRoutes.length === 0) return [];
  if (!inventory.hasTypeScript && !inventory.isNpmPackage && inventory.apiRoutes.length === 0) return [];

  return [{
    ruleId: "DK-TEST-001",
    title: "Project has no test files",
    severity: "high",
    confidence: "high",
    missingControls: ["testCoverage"],
    consequence: "Without tests, regressions ship undetected. Refactoring is risky, and production bugs are found by users instead of developers.",
    acceptanceCriteria: [
      "Project has at least one test file or test directory.",
      "Critical paths (API routes, auth, payments) have test coverage.",
      "Tests run in CI before merge.",
    ],
    evidence: [{ id: "project-scan", detector: "inventory", location: { path: "." }, controls: [], signals: ["no test files found"] }],
  }];
}
