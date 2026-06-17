import { describe, expect, it } from "vitest";
import { renderBenchmarkMarkdown } from "../src/report/benchmark-markdown.js";

describe("renderBenchmarkMarkdown", () => {
  it("renders archetype coverage and result rows", () => {
    const markdown = renderBenchmarkMarkdown({
      results: [
        {
          sample: {
            name: "AI sample",
            archetype: "ai-saas",
            repo: "https://github.com/example/ai",
            why: "demo",
            riskProfile: ["paid-ai"],
            expectedVerdict: "Launch Blocked",
            expectedRuleIds: ["DK-AI-001"],
          },
          status: "match",
          expectedVerdict: "Launch Blocked",
          actualVerdict: "Launch Blocked",
          expectedRuleIds: ["DK-AI-001"],
          actualRuleIds: ["DK-AI-001"],
        },
        {
          sample: {
            name: "Payment sample",
            archetype: "payment-starter",
            repo: "https://github.com/example/pay",
            why: "demo",
            riskProfile: ["payments"],
            expectedVerdict: "Launch Blocked",
            expectedRuleIds: ["DK-WEBHOOK-001"],
          },
          status: "mismatch",
          expectedVerdict: "Launch Blocked",
          actualVerdict: "Production Candidate",
          expectedRuleIds: ["DK-WEBHOOK-001"],
          actualRuleIds: [],
        },
      ],
    });

    expect(markdown).toContain("Archetypes: ai-saas, payment-starter");
    expect(markdown).toContain("| AI sample | ai-saas | match | Launch Blocked | Launch Blocked | DK-AI-001 |");
    expect(markdown).toContain("| Payment sample | payment-starter | mismatch | Launch Blocked | Production Candidate | - |");
  });
});
