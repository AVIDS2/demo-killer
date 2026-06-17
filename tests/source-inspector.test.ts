import { describe, expect, it } from "vitest";
import { inspectRouteSource } from "../src/source-inspector.js";

describe("inspectRouteSource", () => {
  it("detects paid AI calls and missing controls", async () => {
    const evidence = await inspectRouteSource(
      "fixtures/next-ai-saas-risky",
      "app/api/chat/route.ts",
    );

    expect(evidence.capabilities).toContain("callsOpenAI");
    expect(evidence.controls).not.toContain("auth");
    expect(evidence.controls).not.toContain("rateLimit");
    expect(evidence.envVars).toContain("OPENAI_API_KEY");
  });

  it("detects auth and rate limit in the partial fix", async () => {
    const evidence = await inspectRouteSource(
      "fixtures/next-ai-saas-partial-fix",
      "app/api/chat/route.ts",
    );

    expect(evidence.capabilities).toContain("callsOpenAI");
    expect(evidence.controls).toEqual(expect.arrayContaining(["auth", "rateLimit"]));
  });

  it("detects admin data mutation and authorization", async () => {
    const evidence = await inspectRouteSource(
      "fixtures/next-ai-saas-partial-fix",
      "app/api/admin/users/route.ts",
    );

    expect(evidence.capabilities).toContain("mutatesDatabase");
    expect(evidence.controls).toEqual(expect.arrayContaining(["auth", "authorization"]));
  });
});
