import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function ssrfRule(route: RouteSourceEvidence): Finding[] {
  if (!route.controls.includes("ssrfRisk")) return [];

  return [
    {
      ruleId: "DK-SSRF-001",
      title: "HTTP request made with potentially user-controlled URL",
      severity: "blocker",
      confidence: "medium",
      entryPoint: route.path,
      capability: "Makes outbound HTTP request with user-influenced URL",
      asset: "internal network and external services",
      missingControls: ["ssrfProtection"],
      consequence:
        "An attacker can supply internal URLs (e.g. http://169.254.169.254, http://localhost) to access internal services, cloud metadata, or pivot to other systems.",
      acceptanceCriteria: [
        "Outbound URLs are validated against an allowlist of trusted domains.",
        "Internal/private IP ranges are blocked.",
        "User-supplied URL components are not passed directly to HTTP clients.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "ssrfRisk",
          asset: "internal network and external services",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
