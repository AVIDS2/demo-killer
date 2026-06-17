import { describe, expect, it } from "vitest";
import { isGitHubUrl } from "../src/repository.js";
import { runCli } from "../src/cli.js";

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
});

describe("isGitHubUrl", () => {
  it("detects public github repository urls", () => {
    expect(isGitHubUrl("https://github.com/AVIDS2/demo-killer")).toBe(true);
    expect(isGitHubUrl("fixtures/next-ai-saas-risky")).toBe(false);
  });
});
