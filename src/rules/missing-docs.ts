import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";

export function missingDocsRule(inventory: ProjectInventory): Finding[] {
  // Only fire for recognized stacks with routes, or npm packages
  if (!inventory.isNpmPackage && inventory.apiRoutes.length === 0) return [];
  const missing: string[] = [];
  if (!inventory.hasReadme) missing.push("README");
  if (!inventory.hasLicense) missing.push("LICENSE");

  if (missing.length === 0) return [];

  return [{
    ruleId: "DK-README-001",
    title: `Project is missing ${missing.join(" and ")} file(s)`,
    severity: "advisory",
    confidence: "high",
    missingControls: ["projectDocumentation"],
    consequence: "Without README, users and contributors cannot understand the project. Without LICENSE, the project's legal terms are unclear.",
    acceptanceCriteria: [
      "README.md exists with project description, usage, and installation instructions.",
      "LICENSE file exists with an SPDX-compliant license.",
    ],
    evidence: [{ id: "project-scan", detector: "inventory", location: { path: "." }, controls: [], signals: missing.map(m => `missing: ${m}`) }],
  }];
}
