import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";

export function tsStrictRule(inventory: ProjectInventory): Finding[] {
  if (!inventory.hasTypeScript) return [];
  if (inventory.tsStrictMode) return [];
  // Only fire for recognized stacks
  if (inventory.stack === "unknown" && inventory.apiRoutes.length === 0) return [];

  return [{
    ruleId: "DK-TYPES-001",
    title: "TypeScript project does not have strict mode enabled",
    severity: "medium",
    confidence: "high",
    missingControls: ["tsStrictMode"],
    consequence: "Without strict mode, TypeScript allows implicit any, unchecked nulls, and loose type checking — reducing the safety benefit of using TypeScript.",
    acceptanceCriteria: [
      "tsconfig.json has \"strict\": true.",
      "No @ts-ignore or @ts-nocheck used to bypass type errors.",
    ],
    evidence: [{ id: "tsconfig", detector: "inventory", location: { path: "tsconfig.json" }, controls: [], signals: ["strict: false or missing"] }],
  }];
}
