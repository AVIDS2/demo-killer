import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function publicAiRouteRule(route: RouteSourceEvidence): Finding[] {
  const hasAiCall = route.capabilities.includes("callsOpenAI") || route.capabilities.includes("callsAnthropic");
  if (!hasAiCall) return [];

  const missingControls = ["auth", "quota", "rateLimit"].filter(
    (control) => !route.controls.includes(control),
  );

  if (missingControls.length === 0) return [];

  const aiProvider = route.capabilities.includes("callsOpenAI") ? "OpenAI" : "Anthropic";

  return [
    {
      ruleId: "DK-AI-001",
      title: "Paid AI capability is exposed without production abuse controls",
      severity: "blocker",
      confidence: "high",
      entryPoint: route.path,
      capability: `Calls ${aiProvider} API`,
      asset: "paid AI API quota",
      missingControls,
      consequence:
        "A public script can repeatedly trigger paid AI calls and create unexpected API costs.",
      acceptanceCriteria: [
        "Requests require an authenticated user or trusted server-side session.",
        "Usage is bound to a user or tenant.",
        "Per-user or per-IP quota exists.",
        "Abnormal usage is logged.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: aiProvider === "OpenAI" ? "callsOpenAI" : "callsAnthropic",
          asset: "paid AI API quota",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
