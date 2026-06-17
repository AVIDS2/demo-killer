import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveRepository } from "../src/repository.js";

describe("resolveRepository", () => {
  it("returns local paths without cleanup", async () => {
    const resolved = await resolveRepository("fixtures/next-ai-saas-risky");

    expect(resolved.root).toBe("fixtures/next-ai-saas-risky");
    expect(resolved.cleanup).toBeUndefined();
  });

  it("wraps github clone failures in a user-facing error", async () => {
    await expect(resolveRepository("https://github.com/AVIDS2/definitely-not-a-real-repo")).rejects.toThrow(
      "Failed to clone GitHub repository",
    );
  });

  it("cleans up temporary directories after successful clones", async () => {
    const resolved = await resolveRepository("https://github.com/AVIDS2/demo-killer");
    const root = resolved.root;

    expect(existsSync(root)).toBe(true);

    await resolved.cleanup?.();

    expect(existsSync(root)).toBe(false);
  });
});
