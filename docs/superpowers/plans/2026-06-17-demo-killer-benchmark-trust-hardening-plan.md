# Demo Killer Benchmark and Trust Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn real GitHub demo runs into a repeatable benchmark and calibration loop so Demo Killer can prove its verdicts are stable across project archetypes, explain mismatches clearly, and avoid becoming a noisy demo itself.

**Architecture:** Keep the existing evidence engine as the source of truth. Add a manifest-driven benchmark layer that clones public repositories, runs the same local inspection pipeline, compares actual verdicts and finding ids against expected ones, and renders a compact match/mismatch/error summary. Each benchmark sample carries an `archetype` and `riskProfile` so the product does not collapse into a SaaS-only scanner. The benchmark layer should not invent new judgment logic; it should only orchestrate inspection, comparison, and reporting. Public GitHub samples remain outside the default unit test suite and are used for on-demand proof and regression runs.

**Tech Stack:** TypeScript, Node.js, Vitest, existing CLI and inspection engine, `git clone` for public repositories, JSON and Markdown output.

---

## Scope Decisions

This phase does not add MCP, plugins, dashboards, CI gating, or new framework support.

This phase does:

- Lock the public GitHub benchmark manifest to explicit archetypes, risk profiles, and expected outcomes.
- Add a benchmark runner command for real repositories.
- Compare expected verdicts and rule ids against actual inspection results.
- Make repository clone failures user-friendly instead of noisy.
- Record benchmark proof in the docs so regressions are visible.

The benchmark layer is a development and trust tool, not a customer-facing scorecard.

## File Structure

- `benchmarks/github-projects.json` - Public sample manifest with archetypes, risk profiles, expected verdicts, and expected rule ids.
- `src/benchmark.ts` - Benchmark manifest types, loader, and sample normalization.
- `src/benchmark-runner.ts` - Benchmark execution, cloning orchestration, and comparison logic.
- `src/report/benchmark-markdown.ts` - Human-readable benchmark summary renderer.
- `src/repository.ts` - Repository resolution and clone error handling.
- `src/cli.ts` - `benchmark` command wiring.
- `src/index.ts` - Public exports.
- `tests/benchmark.test.ts` - Manifest loader tests.
- `tests/benchmark-runner.test.ts` - Benchmark comparison tests.
- `tests/repository.test.ts` - Clone failure and cleanup tests.
- `tests/cli.test.ts` - CLI benchmark command tests.
- `README.md` - Add benchmark usage and interpretation.
- `docs/mvp-proof.md` - Add benchmark proof guidance and current sample policy.

### Task 1: Freeze the benchmark manifest schema

**Files:**
- Modify: `benchmarks/github-projects.json`
- Create: `src/benchmark.ts`
- Create: `tests/benchmark.test.ts`

- [ ] **Step 1: Write the manifest loader test**

```ts
import { describe, expect, it } from "vitest";
import { loadBenchmarkManifest } from "../src/benchmark";

describe("loadBenchmarkManifest", () => {
  it("loads public benchmark samples with explicit expectations", async () => {
    const samples = await loadBenchmarkManifest("benchmarks/github-projects.json");

    expect(samples).toHaveLength(4);
    expect(samples[0]).toMatchObject({
      name: "AI-SAAS",
      archetype: "ai-saas",
      repo: "https://github.com/amanbsrepo/AI-SAAS",
      expectedVerdict: "Launch Blocked",
      expectedRuleIds: ["DK-AI-001", "DK-DB-001", "DK-WEBHOOK-001"],
    });
  });

  it("keeps the public benchmark broader than a single vertical", async () => {
    const samples = await loadBenchmarkManifest("benchmarks/github-projects.json");
    const archetypes = new Set(samples.map((sample) => sample.archetype));

    expect(archetypes.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Update the benchmark manifest**

```json
[
  {
    "name": "AI-SAAS",
    "archetype": "ai-saas",
    "repo": "https://github.com/amanbsrepo/AI-SAAS",
    "why": "AI-powered SaaS built with Next.js, Prisma, Stripe, Clerk, OpenAI, and Replicate",
    "riskProfile": ["paid-ai", "payments", "database"],
    "expectedVerdict": "Launch Blocked",
    "expectedRuleIds": ["DK-AI-001", "DK-WEBHOOK-001", "DK-DB-001"]
  },
  {
    "name": "SaaS Kit Prisma",
    "archetype": "ai-saas",
    "repo": "https://github.com/Saas-Starter-Kit/Saas-Kit-prisma",
    "why": "Next.js + Prisma + OpenAI SaaS template",
    "riskProfile": ["paid-ai", "payments", "database"],
    "expectedVerdict": "Launch Blocked",
    "expectedRuleIds": ["DK-AI-001", "DK-WEBHOOK-001", "DK-DB-001"]
  },
  {
    "name": "Next.js SaaS Starter",
    "archetype": "payment-starter",
    "repo": "https://github.com/nextjs/saas-starter",
    "why": "Official Next.js SaaS starter with auth and Stripe",
    "riskProfile": ["payments", "database"],
    "expectedVerdict": "Launch Blocked",
    "expectedRuleIds": ["DK-WEBHOOK-001"]
  },
  {
    "name": "Next JS AI SaaS",
    "archetype": "ai-saas",
    "repo": "https://github.com/spsanchore13/next-js-ai-saas",
    "why": "AI SaaS demo with OpenAI and Stripe",
    "riskProfile": ["paid-ai", "payments", "database"],
    "expectedVerdict": "Launch Blocked",
    "expectedRuleIds": ["DK-AI-001", "DK-WEBHOOK-001", "DK-DB-001"]
  },
  {
    "name": "Next.js Subscription Payments",
    "archetype": "payment-starter",
    "repo": "https://github.com/vercel/nextjs-subscription-payments",
    "why": "Payment-focused starter with Stripe and Supabase, useful as a non-AI SaaS-adjacent benchmark",
    "riskProfile": ["payments", "database", "env-contract"],
    "expectedVerdict": "Launch Blocked",
    "expectedRuleIds": ["DK-WEBHOOK-001"]
  }
]
```

- [ ] **Step 3: Implement the manifest types and loader**

```ts
import { promises as fs } from "node:fs";

export type BenchmarkVerdict = "Demo" | "Launch Blocked" | "Production Candidate" | "Insufficient Evidence";

export type BenchmarkArchetype =
  | "ai-saas"
  | "payment-starter"
  | "api-backend"
  | "admin-panel"
  | "content-site"
  | "automation-worker"
  | "agent-app";

export interface BenchmarkSample {
  name: string;
  archetype: BenchmarkArchetype;
  repo: string;
  why: string;
  riskProfile: string[];
  expectedVerdict: BenchmarkVerdict;
  expectedRuleIds: string[];
}

export async function loadBenchmarkManifest(path: string): Promise<BenchmarkSample[]> {
  const raw = await fs.readFile(path, "utf8");
  const data = JSON.parse(raw) as BenchmarkSample[];
  return data.map((sample) => ({
    name: sample.name.trim(),
    archetype: sample.archetype,
    repo: sample.repo.trim(),
    why: sample.why.trim(),
    riskProfile: [...new Set(sample.riskProfile)].sort(),
    expectedVerdict: sample.expectedVerdict,
    expectedRuleIds: [...new Set(sample.expectedRuleIds)].sort(),
  }));
}
```

- [ ] **Step 4: Run the loader test**

Run: `npm test -- tests/benchmark.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add benchmarks/github-projects.json src/benchmark.ts tests/benchmark.test.ts
git commit -m "feat: freeze benchmark manifest"
```

### Task 2: Add a benchmark runner and summary report

**Files:**
- Create: `src/benchmark-runner.ts`
- Create: `src/report/benchmark-markdown.ts`
- Create: `tests/benchmark-runner.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the benchmark runner test**

```ts
import { describe, expect, it } from "vitest";
import { runBenchmarkSuite } from "../src/benchmark-runner";

describe("runBenchmarkSuite", () => {
  it("marks matching samples as match", async () => {
    const result = await runBenchmarkSuite(
      [
        {
          name: "sample",
          repo: "https://github.com/example/sample",
          why: "demo",
          expectedVerdict: "Launch Blocked",
          expectedRuleIds: ["DK-AI-001", "DK-WEBHOOK-001"],
        },
      ],
      {
        inspectRepository: async () => ({
          verdict: "Launch Blocked",
          findings: [
            { ruleId: "DK-AI-001" } as never,
            { ruleId: "DK-WEBHOOK-001" } as never,
          ],
        }),
      }
    );

    expect(result.results[0]).toMatchObject({
      status: "match",
      expectedVerdict: "Launch Blocked",
      actualVerdict: "Launch Blocked",
    });
  });
});
```

- [ ] **Step 2: Implement the benchmark runner**

```ts
import type { AnalysisReport } from "./types";
import type { BenchmarkSample } from "./benchmark";

export interface BenchmarkResult {
  sample: BenchmarkSample;
  status: "match" | "mismatch" | "error";
  expectedVerdict: BenchmarkSample["expectedVerdict"];
  actualVerdict?: AnalysisReport["verdict"];
  expectedRuleIds: string[];
  actualRuleIds: string[];
  error?: string;
}

export interface BenchmarkSuiteResult {
  results: BenchmarkResult[];
}

export interface BenchmarkRunnerDeps {
  inspectRepository(sample: BenchmarkSample): Promise<AnalysisReport>;
}

export async function runBenchmarkSuite(
  samples: BenchmarkSample[],
  deps: BenchmarkRunnerDeps
): Promise<BenchmarkSuiteResult> {
  const results: BenchmarkResult[] = [];

  for (const sample of samples) {
    try {
      const report = await deps.inspectRepository(sample);
      const actualRuleIds = report.findings.map((finding) => finding.ruleId).sort();
      const expectedRuleIds = [...sample.expectedRuleIds].sort();
      const status =
        report.verdict === sample.expectedVerdict &&
        actualRuleIds.length === expectedRuleIds.length &&
        actualRuleIds.every((ruleId, index) => ruleId === expectedRuleIds[index])
          ? "match"
          : "mismatch";

      results.push({
        sample,
        status,
        expectedVerdict: sample.expectedVerdict,
        actualVerdict: report.verdict,
        expectedRuleIds,
        actualRuleIds,
      });
    } catch (error) {
      results.push({
        sample,
        status: "error",
        expectedVerdict: sample.expectedVerdict,
        expectedRuleIds: [...sample.expectedRuleIds].sort(),
        actualRuleIds: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results };
}
```

- [ ] **Step 3: Implement the markdown summary**

```ts
import type { BenchmarkSuiteResult } from "../benchmark-runner";

export function renderBenchmarkMarkdown(result: BenchmarkSuiteResult): string {
  const rows = result.results.map(
    (item) =>
      `| ${item.sample.name} | ${item.status} | ${item.expectedVerdict} | ${item.actualVerdict ?? "-"} | ${item.error ?? item.actualRuleIds.join(", ")} |`
  );

  return [
    "# Demo Killer Benchmark",
    "",
    `Total samples: ${result.results.length}`,
    `Matches: ${result.results.filter((item) => item.status === "match").length}`,
    `Mismatches: ${result.results.filter((item) => item.status === "mismatch").length}`,
    `Errors: ${result.results.filter((item) => item.status === "error").length}`,
    "",
    "| Sample | Status | Expected | Actual | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
```

- [ ] **Step 4: Wire the CLI command**

```ts
export async function runCli(argv: string[] = process.argv.slice(2)) {
  const command = argv[0];

  if (command === "benchmark") {
    const manifestPath = argv[1] ?? "benchmarks/github-projects.json";
    const samples = await loadBenchmarkManifest(manifestPath);
    const result = await runBenchmarkSuite(samples, {
      inspectRepository: async (sample) => {
        const resolved = await resolveRepository(sample.repo);
        try {
          const findings = await analyzeFindings(resolved.root);
          return buildJsonReport(findings);
        } finally {
          await resolved.cleanup?.();
        }
      },
    });

    return {
      exitCode: 0,
      stdout: renderBenchmarkMarkdown(result),
      stderr: "",
    };
  }
}
```

- [ ] **Step 5: Export benchmark APIs**

```ts
export { loadBenchmarkManifest } from "./benchmark";
export { runBenchmarkSuite } from "./benchmark-runner";
export { renderBenchmarkMarkdown } from "./report/benchmark-markdown";
```

- [ ] **Step 6: Update the npm scripts**

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/cli.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "benchmark": "node dist/src/cli.js benchmark benchmarks/github-projects.json --markdown"
  }
}
```

- [ ] **Step 7: Run the benchmark runner test**

Run: `npm test -- tests/benchmark-runner.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/benchmark-runner.ts src/report/benchmark-markdown.ts src/cli.ts src/index.ts package.json tests/benchmark-runner.test.ts
git commit -m "feat: add benchmark runner"
```

### Task 3: Harden GitHub repository resolution

**Files:**
- Modify: `src/repository.ts`
- Create: `tests/repository.test.ts`
- Modify: `tests/cli.test.ts`

- [ ] **Step 1: Write clone failure coverage**

```ts
import { describe, expect, it } from "vitest";
import { resolveRepository } from "../src/repository";

describe("resolveRepository", () => {
  it("returns a friendly error when clone fails", async () => {
    await expect(resolveRepository("https://github.com/not-real/demo")).rejects.toThrow(
      "Failed to clone GitHub repository"
    );
  });
});
```

- [ ] **Step 2: Implement friendly clone errors and cleanup**

```ts
try {
  await execFile("git", ["clone", "--depth", "1", repoUrl, tempDir]);
  return { root: tempDir, cleanup: async () => removeDir(tempDir) };
} catch (error) {
  await removeDir(tempDir);
  throw new Error(
    `Failed to clone GitHub repository: ${error instanceof Error ? error.message : String(error)}`
  );
}
```

- [ ] **Step 3: Add CLI coverage for benchmark errors**

```ts
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

describe("runCli benchmark", () => {
  it("prints a friendly error when a benchmark repository cannot be cloned", async () => {
    const result = await runCli(["benchmark", "benchmarks/github-projects.json"], {
      resolveRepository: async () => {
        throw new Error("git clone failed");
      },
    } as never);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Failed to inspect repository");
    expect(result.stderr).toContain("git clone failed");
  });
});
```

- [ ] **Step 4: Run the repository and CLI tests**

Run: `npm test -- tests/repository.test.ts tests/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repository.ts tests/repository.test.ts tests/cli.test.ts
git commit -m "fix: harden github repository resolution"
```

### Task 4: Document the benchmark protocol and proof story

**Files:**
- Modify: `README.md`
- Modify: `docs/mvp-proof.md`

- [ ] **Step 1: Add benchmark usage to the README**

```md
## Benchmark

Demo Killer can also run against a small public benchmark set:

```powershell
npm run benchmark
```

Each sample is labeled as `match`, `mismatch`, or `error`.

- `match` means the verdict and rule ids matched the stored expectation.
- `mismatch` means the project still analyzes, but the outcome differs from the benchmark expectation.
- `error` means the repository could not be cloned or inspected.
```

- [ ] **Step 2: Extend the MVP proof doc**

```md
## Public GitHub Benchmarks

The public benchmark manifest records a few real AI/SaaS repositories and the expected verdict and rule ids for each one.

The benchmark is intentionally small. It exists to prove that Demo Killer can:

- Clone a public GitHub repository.
- Inspect it with the same local engine used for fixtures.
- Explain when a real sample is still a launch blocker.
- Surface mismatches as calibration work instead of hiding them.

Public samples are not part of the default unit test suite.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/mvp-proof.md
git commit -m "docs: explain benchmark protocol"
```

### Task 5: Final verification

**Files:**
- No new files.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run the benchmark command**

Run: `npm run build` then `npm run benchmark`

Expected: the benchmark summary prints a table with `match`, `mismatch`, or `error` rows.

- [ ] **Step 4: Run one real GitHub sample manually**

Run: `node dist/src/cli.js inspect https://github.com/mohametalmeari/nextjs--ai-saas --markdown`

Expected: report includes `Verdict: Launch Blocked` and concrete blocker ids.

- [ ] **Step 5: Commit any verification adjustments**

```bash
git status --short
git add .
git commit -m "test: verify benchmark trust hardening"
```

## Self-Review

### Spec Coverage

- Real GitHub demos: covered by archetype-aware benchmark manifest and benchmark runner tasks.
- Stable evidence-backed verdicts: covered by sample expectations and verdict comparison.
- Trust hardening: covered by clone failure handling and mismatch reporting.
- Product proof: covered by README and MVP proof updates.

### Implementation Boundaries

This plan does not add MCP, skills, plugins, dashboards, or CI gating. Those should wait until the benchmark summary is stable and the real sample set has been calibrated.

### Placeholder Scan

No placeholder steps remain. Every task includes concrete files, code, and verification commands.

### Type Consistency

The plan uses one shared vocabulary:

- `BenchmarkSample`
- `BenchmarkResult`
- `BenchmarkSuiteResult`
- `loadBenchmarkManifest`
- `runBenchmarkSuite`
- `renderBenchmarkMarkdown`
- `resolveRepository`
