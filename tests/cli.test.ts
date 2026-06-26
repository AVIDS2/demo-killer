import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isGitHubUrl } from "../src/repository.js";
import { isDirectCliInvocation, runCli } from "../src/cli.js";

function mockDeps(overrides: Record<string, unknown> = {}) {
  return {
    resolveRepository: async () => ({ root: "fixtures/next-ai-saas-risky" }),
    hasSupportedProjectEvidence: async () => true,
    analyzeFindings: async () => ({
      findings: [
        {
          ruleId: "DK-AI-001",
          title: "AI",
          severity: "blocker",
          confidence: "high",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
      ],
      inventory: {
        root: ".",
        stack: "nextjs",
        apiRoutes: ["app/api/chat/route.ts"],
        migrationPaths: [],
        hasDockerfile: false,
        projectKind: "web-app" as const,
        hasTests: true,
        hasTypeScript: true,
        tsStrictMode: true,
        hasReadme: true,
        hasLicense: true,
        hasChangelog: false,
        isNpmPackage: false,
        npmFilesField: false,
        packageJson: { dependencies: {}, devDependencies: {} },
      },
    }),
    ...overrides,
  };
}

describe("runCli", () => {
  it("prints help with a successful exit code", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: demokiller init [project-root]");
    expect(result.stdout).toContain("demokiller inspect");
    expect(result.stdout).toContain("demokiller benchmark");
    expect(result.stdout).toContain("demokiller recheck");
  });

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

  it("returns insufficient evidence for unsupported projects with no findings", async () => {
    const result = await runCli(["inspect", "fixtures/unsupported-empty-node", "--json"]);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    // Universal rules may produce advisory findings even on unsupported projects
    const nonAdvisory = parsed.findings.filter((f: any) => f.severity !== "advisory");
    expect(nonAdvisory).toEqual([]);
  });

  it("returns Production Candidate for hardened fixture", async () => {
    const result = await runCli(["inspect", "fixtures/next-ai-saas-hardened", "--json"]);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    // No blockers = Production Candidate (medium findings like graceful shutdown are acceptable)
    expect(parsed.verdict).not.toBe("Launch Blocked");
    expect(parsed.findings.filter((f: { severity: string }) => f.severity === "blocker")).toEqual([]);
  });

  it("detects Express projects as supported scope", async () => {
    const result = await runCli(["inspect", "fixtures/express-ai-saas-risky", "--json"]);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(parsed.verdict).toBe("Launch Blocked");
    expect(parsed.findings.length).toBeGreaterThan(0);
    expect(parsed.supportedScope).toContain("Express");
  });

  it("prints benchmark report with injected dependencies", async () => {
    const result = await runCli(["benchmark", "benchmarks/github-projects.json"], {
      resolveRepository: async () => ({ root: "fixtures/next-ai-saas-risky" }),
      hasSupportedProjectEvidence: async () => true,
      analyzeFindings: async () => ({
        findings: [
          {
            ruleId: "DK-AI-001",
            title: "AI",
            severity: "blocker",
            confidence: "high",
            missingControls: [],
            consequence: "test",
            acceptanceCriteria: [],
            evidence: [],
          },
          {
            ruleId: "DK-DB-001",
            title: "DB",
            severity: "high",
            confidence: "medium",
            missingControls: [],
            consequence: "test",
            acceptanceCriteria: [],
            evidence: [],
          },
          {
            ruleId: "DK-WEBHOOK-001",
            title: "Webhook",
            severity: "blocker",
            confidence: "high",
            missingControls: [],
            consequence: "test",
            acceptanceCriteria: [],
            evidence: [],
          },
        ],
        inventory: {
          root: ".",
          stack: "nextjs",
          apiRoutes: ["app/api/chat/route.ts"],
          migrationPaths: [],
          hasDockerfile: false,
          projectKind: "web-app" as const,
          hasTests: true,
          hasTypeScript: true,
          tsStrictMode: true,
          hasReadme: true,
          hasLicense: true,
          hasChangelog: false,
          isNpmPackage: false,
          npmFilesField: false,
          packageJson: { dependencies: {}, devDependencies: {} },
        },
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Demo Killer Benchmark");
    expect(result.stdout).toContain("Archetypes:");
  });

  it("returns a friendly error when inspect clone fails", async () => {
    const result = await runCli(["inspect", "https://github.com/AVIDS2/definitely-not-a-real-repo"], {
      resolveRepository: async () => {
        throw new Error("raw git error");
      },
      analyzeFindings: async () => ({
        findings: [],
        inventory: {
          root: ".",
          stack: "unknown" as const,
          apiRoutes: [],
          migrationPaths: [],
          hasDockerfile: false,
          projectKind: "unknown" as const,
          hasTests: false,
          hasTypeScript: false,
          tsStrictMode: false,
          hasReadme: false,
          hasLicense: false,
          hasChangelog: false,
          isNpmPackage: false,
          npmFilesField: false,
          packageJson: { dependencies: {}, devDependencies: {} },
        },
      }),
      hasSupportedProjectEvidence: async () => false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Failed to inspect repository");
    expect(result.stderr).toContain("raw git error");
  });

  it("initializes agent guidance for a target project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "demokiller-cli-init-"));
    try {
      const result = await runCli(["init", root]);

      await expect(fs.readFile(path.join(root, ".demokiller", "AGENT.md"), "utf8")).resolves.toContain(
        "Kill your demo",
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Initialized Demo Killer");
      expect(result.stdout).toContain(".demokiller/AGENT.md");
      expect(result.stdout).toContain("AGENTS.md");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("recheck compares snapshot and reports diff", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "demokiller-recheck-"));
    const snapshotPath = path.join(tmpDir, "snapshot.json");
    const snapshot = {
      verdict: "Launch Blocked",
      supportedScope: [],
      findings: [
        {
          ruleId: "DK-AI-001",
          title: "AI",
          severity: "blocker",
          confidence: "high",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
        {
          ruleId: "DK-DB-001",
          title: "DB",
          severity: "high",
          confidence: "medium",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
      ],
      hardeningPlan: { summary: "", phases: [], recheckCommand: "" },
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

    try {
      const result = await runCli([
        "recheck",
        "fixtures/next-ai-saas-hardened",
        "--snapshot",
        snapshotPath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Previous verdict: Launch Blocked");
      expect(result.stdout).toContain("Current verdict:");
      expect(result.stdout).toContain("Resolved");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("recheck outputs json with --json flag", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "demokiller-recheck-json-"));
    const snapshotPath = path.join(tmpDir, "snapshot.json");
    const snapshot = {
      verdict: "Launch Blocked",
      supportedScope: [],
      findings: [
        {
          ruleId: "DK-AI-001",
          title: "AI",
          severity: "blocker",
          confidence: "high",
          missingControls: [],
          consequence: "test",
          acceptanceCriteria: [],
          evidence: [],
        },
      ],
      hardeningPlan: { summary: "", phases: [], recheckCommand: "" },
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

    try {
      const result = await runCli([
        "recheck",
        "fixtures/next-ai-saas-hardened",
        "--snapshot",
        snapshotPath,
        "--json",
      ]);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.previousVerdict).toBe("Launch Blocked");
      expect(parsed.resolved).toContain("DK-AI-001");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("isGitHubUrl", () => {
  it("detects public github repository urls", () => {
    expect(isGitHubUrl("https://github.com/AVIDS2/demokiller")).toBe(true);
    expect(isGitHubUrl("fixtures/next-ai-saas-risky")).toBe(false);
  });
});

describe("isDirectCliInvocation", () => {
  it("matches relative cli paths against module urls", () => {
    const relativePath = "dist/src/cli.js";
    const moduleUrl = pathToFileURL(path.resolve(relativePath)).href;

    expect(isDirectCliInvocation(moduleUrl, relativePath)).toBe(true);
  });
});
