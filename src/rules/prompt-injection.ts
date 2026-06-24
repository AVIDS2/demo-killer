import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function promptInjectionRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("promptInjection")) return [];

  return [{
    ruleId: "DK-AGENT-004",
    title: "User input is directly interpolated into LLM prompt",
    severity: "blocker",
    confidence: "medium",
    entryPoint: route.path,
    capability: "Prompt constructed with unsanitized user input",
    asset: "LLM behavior and output integrity",
    missingControls: ["promptSanitization"],
    consequence: "Attackers can inject instructions into the prompt to override system behavior, extract secrets, or cause the agent to perform unintended actions.",
    acceptanceCriteria: [
      "User input is passed as data, not interpolated into prompt templates.",
      "System prompt is separated from user content using message roles.",
      "Input is sanitized (length limits, character filtering) before use.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "promptInjection", asset: "LLM behavior and output integrity", controls: route.controls, signals: route.capabilities }],
  }];
}
