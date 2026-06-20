import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../src/state.js";
import type { AnalysisReport } from "../src/types.js";

const before: AnalysisReport = {
  verdict: "Launch Blocked",
  supportedScope: [],
  generatedAt: "2026-06-17T00:00:00.000Z",
  hardeningPlan: {
    summary: "test",
    phases: [],
    recheckCommand: "demokiller inspect . --markdown",
  },
  findings: [
    {
      ruleId: "DK-AI-001",
      title: "Paid AI capability is exposed without production abuse controls",
      severity: "blocker",
      confidence: "high",
      entryPoint: "app/api/chat/route.ts",
      missingControls: ["auth"],
      consequence: "Cost abuse.",
      acceptanceCriteria: ["Require auth."],
      evidence: [],
    },
  ],
};

const after: AnalysisReport = {
  ...before,
  findings: [],
  verdict: "Production Candidate",
};

describe("diffSnapshots", () => {
  it("shows resolved findings", () => {
    const diff = diffSnapshots(before, after);

    expect(diff.resolvedRuleIds).toEqual(["DK-AI-001"]);
    expect(diff.newRuleIds).toEqual([]);
  });
});
