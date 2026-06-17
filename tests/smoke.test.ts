import { describe, expect, it } from "vitest";
import type { Verdict } from "../src/types.js";

describe("project setup", () => {
  it("supports the MVP verdict vocabulary", () => {
    const verdict: Verdict = "Launch Blocked";
    expect(verdict).toBe("Launch Blocked");
  });
});
