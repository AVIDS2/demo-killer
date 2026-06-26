import { describe, expect, it } from "vitest";
import {
  handleInspectProject,
  handleListLaunchBlockers,
  handleGenerateHardeningPlan,
} from "../src/mcp.js";

const RISKY_FIXTURE = "fixtures/next-ai-saas-risky";
const PARTIAL_FIX = "fixtures/next-ai-saas-partial-fix";

function parseJsonContent(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe("handleInspectProject", () => {
  it("returns a full report for the risky fixture (JSON format)", async () => {
    const result = await handleInspectProject(RISKY_FIXTURE, "json");
    expect(result.isError).toBeUndefined();
    const report = parseJsonContent(result);

    expect(report.verdict).toBe("Launch Blocked");
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.hardeningPlan).toBeDefined();
    expect(report.hardeningPlan.phases).toHaveLength(3);
    expect(report.generatedAt).toBeDefined();
  });

  it("returns markdown when format is markdown", async () => {
    const result = await handleInspectProject(RISKY_FIXTURE, "markdown");
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    expect(text).toContain("# Demo Killer Report");
    expect(text).toContain("Verdict: Launch Blocked");
    expect(text).toContain("## Findings");
    expect(text).toContain("## Hardening Plan");
  });

  it("returns fewer blockers for the partial-fix fixture", async () => {
    const result = await handleInspectProject(PARTIAL_FIX, "json");
    const report = parseJsonContent(result);

    expect(report.verdict).toBe("Launch Blocked");
    const blockerCount = report.findings.filter(
      (f: { severity: string }) => f.severity === "blocker",
    ).length;
    expect(blockerCount).toBeLessThan(
      parseJsonContent(await handleInspectProject(RISKY_FIXTURE, "json")).findings.filter(
        (f: { severity: string }) => f.severity === "blocker",
      ).length,
    );
  });

  it("defaults to JSON format", async () => {
    const result = await handleInspectProject(RISKY_FIXTURE);
    expect(result.content[0].text).toContain('"verdict"');
  });
});

describe("handleListLaunchBlockers", () => {
  it("returns only blocker findings from the risky fixture", async () => {
    const result = await handleListLaunchBlockers(RISKY_FIXTURE);
    expect(result.isError).toBeUndefined();
    const data = parseJsonContent(result);

    expect(data.verdict).toBe("Launch Blocked");
    expect(data.blockerCount).toBeGreaterThan(0);
    expect(data.blockers).toBeInstanceOf(Array);

    for (const blocker of data.blockers) {
      expect(blocker.ruleId).toBeDefined();
      expect(blocker.title).toBeDefined();
      expect(blocker.consequence).toBeDefined();
      expect(blocker.acceptanceCriteria).toBeInstanceOf(Array);
    }
  });

  it("returns zero blockers for a clean project", async () => {
    const result = await handleListLaunchBlockers("fixtures/unsupported-empty-node");
    const data = parseJsonContent(result);
    // Project type advisories are expected even on clean/unsupported projects
    expect(data.blockers.filter((b: any) => b.ruleId !== "DK-UNIVERSAL-001")).toEqual([]);
  });
});

describe("handleGenerateHardeningPlan", () => {
  it("returns a three-phase plan for the risky fixture", async () => {
    const result = await handleGenerateHardeningPlan(RISKY_FIXTURE);
    expect(result.isError).toBeUndefined();
    const plan = parseJsonContent(result);

    expect(plan.summary).toBeDefined();
    expect(plan.phases).toHaveLength(3);
    expect(plan.phases[0].id).toBe("phase-0");
    expect(plan.phases[0].title).toBe("Stop Launch");
    expect(plan.phases[0].findingRuleIds.length).toBeGreaterThan(0);
    expect(plan.phases[1].id).toBe("phase-1");
    expect(plan.phases[2].id).toBe("phase-2");
    expect(plan.recheckCommand).toBe("demokiller inspect . --markdown");
  });

  it("returns empty phase-0 for a clean project", async () => {
    const result = await handleGenerateHardeningPlan("fixtures/unsupported-empty-node");
    const plan = parseJsonContent(result);

    expect(plan.phases[0].findingRuleIds).toEqual([]);
  });
});

describe("error handling", () => {
  it("returns isError for a non-existent path", async () => {
    const result = await handleInspectProject("/nonexistent/path/that/does/not/exist");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error:");
  });
});
