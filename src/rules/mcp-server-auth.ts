import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function mcpServerAuthRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("mcpServer")) return [];
  if (route.controls.includes("auth")) return [];

  return [{
    ruleId: "DK-AGENT-002",
    title: "MCP server exposes tools without authentication",
    severity: "blocker",
    confidence: "medium",
    entryPoint: route.path,
    capability: "MCP server with unauthenticated tool access",
    asset: "tool execution surface",
    missingControls: ["mcpAuth"],
    consequence: "Any client that can reach the MCP server can invoke tools without identity verification, enabling unauthorized actions.",
    acceptanceCriteria: [
      "MCP server requires authentication (token, API key, or session).",
      "Tool invocations are logged with caller identity.",
      "Sensitive tools require explicit authorization checks.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "mcpServer", asset: "tool execution surface", controls: route.controls, signals: route.capabilities }],
  }];
}
