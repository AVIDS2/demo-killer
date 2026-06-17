import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fixture corpus", () => {
  it("contains risky and partial-fix nextjs samples", () => {
    expect(existsSync("fixtures/next-ai-saas-risky/package.json")).toBe(true);
    expect(existsSync("fixtures/next-ai-saas-partial-fix/package.json")).toBe(true);
  });

  it("contains golden expected findings", () => {
    expect(existsSync("fixtures/expected/next-ai-saas-risky.findings.json")).toBe(true);
    expect(existsSync("fixtures/expected/next-ai-saas-partial-fix.findings.json")).toBe(true);
  });
});
