import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function hardcodedSecretRule(route: RouteSourceEvidence): Finding[] {
  if (!route.controls.includes("hardcodedSecrets")) return [];

  return [
    {
      ruleId: "DK-SECRET-001",
      title: "Route file contains hardcoded secrets or API keys",
      severity: "blocker",
      confidence: "high",
      entryPoint: route.path,
      capability: "Embeds secret values directly in source code",
      asset: "credentials and API access",
      missingControls: ["secretManagement"],
      consequence:
        "Hardcoded secrets in source code are exposed in version control, build artifacts, and logs. They cannot be rotated without a code change.",
      acceptanceCriteria: [
        "Secrets are loaded from environment variables or a secret manager.",
        "No API keys, tokens, or passwords appear as string literals in source.",
        "Secret values are not logged or included in error responses.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "hardcodedSecrets",
          asset: "credentials and API access",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
