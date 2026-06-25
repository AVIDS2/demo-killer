import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function requestTimeoutRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("consumesRequestBody")) return [];
  if (route.controls.includes("timeoutHandling")) return [];

  // Only flag routes that make outbound calls (HTTP, DB, AI)
  if (!route.capabilities.some(c => ["callsOpenAI", "callsAnthropic", "handlesPaymentProvider", "readsDatabase", "mutatesDatabase"].includes(c))) return [];

  return [{
    ruleId: "DK-OPS-003",
    title: "Route makes outbound calls without explicit timeout configuration",
    severity: "medium",
    confidence: "low",
    entryPoint: route.path,
    capability: "Outbound call without timeout guard",
    asset: "API responsiveness",
    missingControls: ["timeoutHandling"],
    consequence: "If the external service hangs, the request blocks indefinitely, exhausting connection pool and worker threads.",
    acceptanceCriteria: [
      "HTTP clients have explicit timeout configuration (e.g. AbortController, timeout option).",
      "Database queries have statement timeout.",
      "AI API calls have timeout + retry with backoff.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "noTimeout", asset: "API responsiveness", controls: route.controls, signals: route.capabilities }],
  }];
}
