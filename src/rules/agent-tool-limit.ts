import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function agentToolLimitRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("agentTool")) return [];
  if (route.controls.includes("rateLimit")) return [];

  return [{
    ruleId: "DK-AGENT-003",
    title: "Agent tool has no call frequency or count limit",
    severity: "high",
    confidence: "medium",
    entryPoint: route.path,
    capability: "Agent tool can be called without limits",
    asset: "resource consumption and cost",
    missingControls: ["toolRateLimit"],
    consequence: "An agent loop or malicious prompt can trigger unbounded tool calls, burning API credits, overwhelming databases, or causing cascading failures.",
    acceptanceCriteria: [
      "Tool calls are rate-limited per user or per session.",
      "Maximum call count per agent run is enforced.",
      "Abnormal call patterns are logged and alerted.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "agentTool", asset: "resource consumption and cost", controls: route.controls, signals: route.capabilities }],
  }];
}
