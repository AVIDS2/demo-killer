import { describe, expect, it } from "vitest";
import { buildJsonReport } from "../src/report/json.js";
import { renderMarkdownReport } from "../src/report/markdown.js";
import type { Finding } from "../src/types.js";

const finding: Finding = {
  ruleId: "DK-AI-001",
  title: "Paid AI capability is exposed without production abuse controls",
  severity: "blocker",
  confidence: "high",
  entryPoint: "app/api/chat/route.ts",
  capability: "Calls OpenAI chat completion",
  asset: "paid AI API quota",
  missingControls: ["auth", "quota", "rateLimit"],
  consequence: "A public script can repeatedly trigger paid AI calls.",
  acceptanceCriteria: ["Requests require auth."],
  evidence: [
    {
      id: "route-source",
      detector: "source-inspector",
      location: { path: "app/api/chat/route.ts", line: 5 },
      controls: [],
      signals: ["callsOpenAI"],
    },
  ],
};

describe("reports", () => {
  it("builds a launch blocked json report", () => {
    const report = buildJsonReport([finding], "2026-06-17T00:00:00.000Z");

    expect(report.verdict).toBe("Launch Blocked");
    expect(report.findings[0]?.ruleId).toBe("DK-AI-001");
  });

  it("renders production consequence and evidence in markdown", () => {
    const report = buildJsonReport([finding], "2026-06-17T00:00:00.000Z");
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("Verdict: Launch Blocked");
    expect(markdown).toContain("A public script can repeatedly trigger paid AI calls.");
    expect(markdown).toContain("app/api/chat/route.ts:5");
  });
});
