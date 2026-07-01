import { describe, expect, it, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { analyzeFindings } from "../src/rules/index.js";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/next-ai-saas-risky");

describe("custom rules plugin system", () => {
  const pluginDir = path.join(FIXTURE, ".demokiller", "plugins");

  beforeEach(() => {
    fs.mkdirSync(pluginDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(path.join(FIXTURE, ".demokiller"), { recursive: true, force: true });
  });

  it("loads and applies custom rules from .demokiller/plugins/", async () => {
    const rule = [{
      ruleId: "CUSTOM-001",
      title: "No TODO comments in production",
      severity: "medium" as const,
      confidence: "high" as const,
      patterns: ["//\\s*TODO"]
    }];
    fs.writeFileSync(path.join(pluginDir, "no-todo.json"), JSON.stringify(rule));

    // Write a fixture file with a TODO comment
    const todoFile = path.join(FIXTURE, "app", "_dk_test_todo.ts");
    fs.writeFileSync(todoFile, `// TODO: fix this later\nexport const x = 1;\n`);

    try {
      const { findings } = await analyzeFindings(FIXTURE);
      const customFindings = findings.filter(f => f.ruleId === "CUSTOM-001");
      expect(customFindings.length).toBeGreaterThan(0);
      expect(customFindings[0].title).toBe("No TODO comments in production");
      expect(customFindings[0].severity).toBe("medium");
    } finally {
      fs.unlinkSync(todoFile);
    }
  });

  it("ignores malformed plugin files", async () => {
    fs.writeFileSync(path.join(pluginDir, "bad.json"), "not json {{{");

    const { findings } = await analyzeFindings(FIXTURE);
    expect(findings).toBeDefined();
    expect(findings.every(f => f.ruleId !== "CUSTOM-001")).toBe(true);
  });

  it("returns no custom findings when plugin dir doesn't exist", async () => {
    fs.rmSync(pluginDir, { recursive: true, force: true });

    const { findings } = await analyzeFindings(FIXTURE);
    const customFindings = findings.filter(f => f.ruleId.startsWith("CUSTOM-"));
    expect(customFindings).toEqual([]);
  });
});
