import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function logInjectionRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("consumesRequestBody")) return [];
  if (!route.controls.includes("logging")) return [];
  if (route.controls.includes("logSanitization")) return [];

  return [
    {
      ruleId: "DK-LOGI-001",
      title: "User-controlled input may be written directly to logs",
      severity: "medium",
      confidence: "low",
      entryPoint: route.path,
      capability: "Logs request data without sanitization",
      asset: "log integrity and observability",
      missingControls: ["logSanitization"],
      consequence:
        "Attackers can inject fake log entries, newlines, or ANSI escape sequences to corrupt logs, forge audit trails, or exploit log processing tools.",
      acceptanceCriteria: [
        "User input is sanitized (newlines stripped) before logging.",
        "Structured logging is used instead of string interpolation.",
        "Log output is escaped or encoded.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "logInjection",
          asset: "log integrity and observability",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
