import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";

export function npmPublishRule(inventory: ProjectInventory): Finding[] {
  if (!inventory.isNpmPackage) return [];
  if (inventory.npmFilesField) return [];

  return [{
    ruleId: "DK-PUBLISH-001",
    title: "npm package has no `files` field — may publish sensitive or unnecessary files",
    severity: "high",
    confidence: "medium",
    missingControls: ["publishGuard"],
    consequence: "Without a `files` field in package.json, all files in the project directory are published to npm, including tests, fixtures, .env files, and development artifacts.",
    acceptanceCriteria: [
      "package.json has a `files` array listing only the files needed by consumers.",
      ".npmignore is used as a fallback for complex exclusion patterns.",
      "Sensitive files (.env, credentials, test fixtures) are excluded from the published package.",
    ],
    evidence: [{ id: "package-json", detector: "inventory", location: { path: "package.json" }, controls: [], signals: ["missing files field"] }],
  }];
}
