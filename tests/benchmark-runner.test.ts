import { describe, expect, it } from "vitest";
import { runBenchmarkSuite } from "../src/benchmark-runner.js";
import type { AnalysisReport } from "../src/types.js";

function report(ruleIds: string[], verdict: AnalysisReport["verdict"] = "Launch Blocked"): AnalysisReport {
  return {
    verdict,
    supportedScope: [],
    generatedAt: "2026-06-17T00:00:00.000Z",
    findings: ruleIds.map((ruleId) => ({
      ruleId,
      title: ruleId,
      severity: "blocker",
      confidence: "high",
      missingControls: [],
      consequence: "test",
      acceptanceCriteria: [],
      evidence: [],
    })),
  };
}

describe("runBenchmarkSuite", () => {
  it("marks samples as match when verdict and rule ids match", async () => {
    const result = await runBenchmarkSuite(
      [
        {
          name: "sample",
          archetype: "ai-saas",
          repo: "https://github.com/example/sample",
          why: "demo",
          riskProfile: ["paid-ai"],
          expectedVerdict: "Launch Blocked",
          expectedRuleIds: ["DK-WEBHOOK-001", "DK-AI-001"],
        },
      ],
      {
        inspectRepository: async () => report(["DK-AI-001", "DK-WEBHOOK-001"]),
      },
    );

    expect(result.results[0]).toMatchObject({
      status: "match",
      expectedVerdict: "Launch Blocked",
      actualVerdict: "Launch Blocked",
      expectedRuleIds: ["DK-AI-001", "DK-WEBHOOK-001"],
      actualRuleIds: ["DK-AI-001", "DK-WEBHOOK-001"],
    });
  });

  it("marks samples as mismatch when expected rule ids differ", async () => {
    const result = await runBenchmarkSuite(
      [
        {
          name: "sample",
          archetype: "payment-starter",
          repo: "https://github.com/example/sample",
          why: "demo",
          riskProfile: ["payments"],
          expectedVerdict: "Launch Blocked",
          expectedRuleIds: ["DK-WEBHOOK-001"],
        },
      ],
      {
        inspectRepository: async () => report(["DK-WEBHOOK-001", "DK-DB-001"]),
      },
    );

    expect(result.results[0]).toMatchObject({
      status: "mismatch",
      actualRuleIds: ["DK-DB-001", "DK-WEBHOOK-001"],
    });
  });

  it("records errors without aborting the whole suite", async () => {
    const result = await runBenchmarkSuite(
      [
        {
          name: "sample",
          archetype: "api-backend",
          repo: "https://github.com/example/sample",
          why: "demo",
          riskProfile: ["api"],
          expectedVerdict: "Launch Blocked",
          expectedRuleIds: [],
        },
      ],
      {
        inspectRepository: async () => {
          throw new Error("clone failed");
        },
      },
    );

    expect(result.results[0]).toMatchObject({
      status: "error",
      error: "clone failed",
    });
  });
});
