import { describe, expect, it } from "vitest";
import { loadBenchmarkManifest } from "../src/benchmark.js";

describe("loadBenchmarkManifest", () => {
  it("loads public benchmark samples with archetypes and explicit expectations", async () => {
    const samples = await loadBenchmarkManifest("benchmarks/github-projects.json");

    expect(samples.length).toBeGreaterThanOrEqual(10);
    expect(samples[0]).toMatchObject({
      name: "AI-SAAS",
      archetype: "ai-saas",
      repo: "https://github.com/amanbsrepo/AI-SAAS",
      expectedVerdict: "Launch Blocked",
      expectedRuleIds: ["DK-AI-001", "DK-DB-001", "DK-ENV-001", "DK-WEBHOOK-001"],
    });
  });

  it("keeps the public benchmark broader than a single vertical", async () => {
    const samples = await loadBenchmarkManifest("benchmarks/github-projects.json");
    const archetypes = [...new Set(samples.map((sample: (typeof samples)[number]) => sample.archetype))];

    expect(archetypes).toEqual(
      expect.arrayContaining([
        "ai-saas",
        "payment-starter",
        "api-backend",
        "admin-panel",
        "automation-worker",
        "agent-app",
        "content-site",
      ]),
    );
  });
});
