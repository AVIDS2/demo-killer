import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isGitHubUrl } from "../src/repository.js";
import { isDirectCliInvocation, runCli } from "../src/cli.js";

describe("runCli", () => {
  it("prints markdown report for inspect", async () => {
    const result = await runCli(["inspect", "fixtures/next-ai-saas-risky", "--markdown"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Verdict: Launch Blocked");
    expect(result.stdout).toContain("DK-AI-001");
  });

  it("prints json report for inspect", async () => {
    const result = await runCli(["inspect", "fixtures/next-ai-saas-risky", "--json"]);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(parsed.verdict).toBe("Launch Blocked");
  });

  it("returns insufficient evidence for unsupported projects with no findings", async () => {
    const result = await runCli(["inspect", "fixtures/unsupported-empty-node", "--json"]);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(parsed.verdict).toBe("Insufficient Evidence");
  });

  it("prints benchmark report with injected dependencies", async () => {
    const result = await runCli(["benchmark", "benchmarks/github-projects.json"], {
      resolveRepository: async () => ({ root: "fixtures/next-ai-saas-risky" }),
      hasSupportedProjectEvidence: async () => true,
      analyzeFindings: async () => [
        {
          ruleId: "DK-AI-001",
          title: "AI",
          severity: "blocker",
          confidence: "high",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
        {
          ruleId: "DK-DB-001",
          title: "DB",
          severity: "high",
          confidence: "medium",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
        {
          ruleId: "DK-WEBHOOK-001",
          title: "Webhook",
          severity: "blocker",
          confidence: "high",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Demo Killer Benchmark");
    expect(result.stdout).toContain("Archetypes:");
  });

  it("returns a friendly error when inspect clone fails", async () => {
    const result = await runCli(["inspect", "https://github.com/AVIDS2/definitely-not-a-real-repo"], {
      resolveRepository: async () => {
        throw new Error("raw git error");
      },
      analyzeFindings: async () => [],
      hasSupportedProjectEvidence: async () => false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Failed to inspect repository");
    expect(result.stderr).toContain("raw git error");
  });
});

describe("isGitHubUrl", () => {
  it("detects public github repository urls", () => {
    expect(isGitHubUrl("https://github.com/AVIDS2/demo-killer")).toBe(true);
    expect(isGitHubUrl("fixtures/next-ai-saas-risky")).toBe(false);
  });
});

describe("isDirectCliInvocation", () => {
  it("matches relative cli paths against module urls", () => {
    const relativePath = "dist/src/cli.js";
    const moduleUrl = pathToFileURL(path.resolve(relativePath)).href;

    expect(isDirectCliInvocation(moduleUrl, relativePath)).toBe(true);
  });
});
