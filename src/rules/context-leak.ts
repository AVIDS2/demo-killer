import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function contextLeakRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("contextLeak")) return [];

  return [{
    ruleId: "DK-AGENT-005",
    title: "System prompt or agent memory is exposed to the user",
    severity: "high",
    confidence: "medium",
    entryPoint: route.path,
    capability: "Returns internal LLM context to the caller",
    asset: "system prompt and agent configuration",
    missingControls: ["contextIsolation"],
    consequence: "Exposing the system prompt allows attackers to understand guardrails, craft bypasses, and extract confidential instructions or API keys embedded in prompts.",
    acceptanceCriteria: [
      "System prompt is never included in API responses.",
      "Agent memory and context are stripped from user-facing output.",
      "Debug endpoints that expose prompts are disabled in production.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "contextLeak", asset: "system prompt and agent configuration", controls: route.controls, signals: route.capabilities }],
  }];
}
