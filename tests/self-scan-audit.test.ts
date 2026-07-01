import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { analyzeFindings } from "../src/rules/index.js";

const SELF_ROOT = path.resolve(import.meta.dirname, "..");

describe("self-scan audit", () => {
  it("has zero blockers on self-scan", { timeout: 60000 }, async () => {
    const { findings } = await analyzeFindings(SELF_ROOT);
    const srcFindings = findings.filter(f => {
      const srcFiles = [...new Set(f.evidence.map(e => e.location?.path || "unknown"))].filter(p => !p.startsWith("tests/") && !p.includes("/tests/"));
      return srcFiles.length > 0;
    });
    const blockers = srcFindings.filter(f => f.severity === "blocker");
    expect(blockers).toEqual([]);
  });

  it("outputs all findings to audit file", { timeout: 60000 }, async () => {
    const { findings } = await analyzeFindings(SELF_ROOT);
    const summary: Record<string, { ruleId: string; title: string; severity: string; files: string[] }[]> = {
      blocker: [], high: [], medium: [], advisory: []
    };
    for (const f of findings) {
      const srcFiles = [...new Set(f.evidence.map(e => e.location?.path || "unknown"))].filter(p => !p.startsWith("tests/") && !p.includes("/tests/"));
      if (srcFiles.length === 0) continue;
      const sev = f.severity as keyof typeof summary;
      if (!summary[sev]) summary[sev] = [];
      summary[sev].push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        files: srcFiles
      });
    }
    const outPath = path.join(SELF_ROOT, "demokiller", "self-scan-audit.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

    expect(summary.blocker.length).toBe(0);
    expect(summary.high.length).toBeLessThanOrEqual(5);
    expect(summary.medium.length + summary.advisory.length).toBeGreaterThan(0);
  });
});
