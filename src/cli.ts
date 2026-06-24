#!/usr/bin/env node
import { analyzeFindings } from "./rules/index.js";
import { buildInventory } from "./inventory.js";
import { loadConfig, applyConfig } from "./config.js";
import { loadBenchmarkManifest } from "./benchmark.js";
import { initializeProject } from "./init.js";
import { runBenchmarkSuite } from "./benchmark-runner.js";
import { buildJsonReport } from "./report/json.js";
import { renderBenchmarkMarkdown } from "./report/benchmark-markdown.js";
import { renderMarkdownReport } from "./report/markdown.js";
import { resolveRepository } from "./repository.js";
import { diffSnapshots } from "./state.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AnalysisReport, Finding } from "./types.js";
import type { ResolvedRepository } from "./repository.js";
import type { ProjectInventory } from "./inventory.js";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliDependencies {
  resolveRepository(input: string): Promise<ResolvedRepository>;
  analyzeFindings(root: string): Promise<{ findings: Finding[]; inventory: ProjectInventory }>;
  hasSupportedProjectEvidence(root: string): Promise<boolean>;
}

const defaultDependencies: CliDependencies = {
  resolveRepository,
  analyzeFindings,
  hasSupportedProjectEvidence: async (root) => {
    const inventory = await buildInventory(root);
    const supportedStacks = [
      "nextjs", "express", "fastify", "flask", "fastapi", "django",
      "gin", "echo", "fiber", "actix", "axum", "rocket",
      "spring-boot", "ktor", "laravel", "rails", "sinatra",
      "aspnet", "vapor", "http4s", "akka",
    ];
    return supportedStacks.includes(inventory.stack) && inventory.apiRoutes.length > 0;
  },
};

const usage = [
  "Usage: demokiller init [project-root]",
  "       demokiller inspect [project-root-or-github-url] [--json|--markdown]",
  "       demokiller recheck [project-root] [--snapshot <path>] [--json|--markdown]",
  "       demokiller benchmark [manifest-path]",
].join("\n");

const DEFAULT_SNAPSHOT = ".demokiller/last-report.json";

async function runInspection(
  input: string,
  dependencies: CliDependencies,
): Promise<{ report: AnalysisReport; resolved: ResolvedRepository }> {
  const resolved = await dependencies.resolveRepository(input);
  const { findings, inventory } = await dependencies.analyzeFindings(resolved.root);
  const config = await loadConfig(resolved.root);
  const filteredFindings = applyConfig(findings, config);
  const supportedStacks = ["nextjs", "express", "fastify", "flask", "fastapi", "django", "gin", "echo", "fiber", "actix", "axum", "rocket", "spring-boot", "ktor", "laravel", "rails", "sinatra", "aspnet", "vapor", "http4s", "akka"];
  const hasEvidence = supportedStacks.includes(inventory.stack) && inventory.apiRoutes.length > 0;
  const report = buildJsonReport(filteredFindings, new Date().toISOString(), {
    hasSupportedProjectEvidence: hasEvidence,
  });
  return { report, resolved };
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  dependencies: CliDependencies = defaultDependencies,
): Promise<CliResult> {
  const command = argv[0];
  const input = argv[1] && !argv[1].startsWith("--") ? argv[1] : process.cwd();
  const wantsJson = argv.includes("--json");

  if (!command || command === "--help" || command === "-h") {
    return {
      exitCode: 0,
      stdout: usage,
      stderr: "",
    };
  }

  if (command === "init") {
    try {
      const result = await initializeProject(input);
      const files = result.files.map((file) => `- ${file.path}: ${file.status}`).join("\n");
      return {
        exitCode: 0,
        stdout: `Initialized Demo Killer in ${result.root}\n\n${files}`,
        stderr: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Failed to initialize Demo Killer: ${message}`,
      };
    }
  }

  if (command === "benchmark") {
    const manifestPath = input;
    const samples = await loadBenchmarkManifest(manifestPath);
    const benchmark = await runBenchmarkSuite(samples, {
      inspectRepository: async (sample) => {
        const resolved = await dependencies.resolveRepository(sample.repo);
        try {
          const { findings, inventory } = await dependencies.analyzeFindings(resolved.root);
          const hasEvidence = inventory.stack === "nextjs" && inventory.apiRoutes.length > 0;
          return buildJsonReport(findings, new Date().toISOString(), {
            hasSupportedProjectEvidence: hasEvidence,
          });
        } finally {
          await resolved.cleanup?.();
        }
      },
    });

    return {
      exitCode: 0,
      stdout: renderBenchmarkMarkdown(benchmark),
      stderr: "",
    };
  }

  if (command === "recheck") {
    const snapshotIdx = argv.indexOf("--snapshot");
    const snapshotPath =
      snapshotIdx >= 0 && argv[snapshotIdx + 1] ? argv[snapshotIdx + 1] : DEFAULT_SNAPSHOT;

    try {
      const { promises: fs } = await import("node:fs");
      const previous: AnalysisReport = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
      const { report: current, resolved } = await runInspection(input, dependencies);
      await resolved.cleanup?.();

      const diff = diffSnapshots(previous, current);
      const result = {
        previousVerdict: diff.previousVerdict,
        currentVerdict: diff.currentVerdict,
        resolved: diff.resolvedRuleIds,
        remaining: diff.remainingRuleIds,
        newFindings: diff.newRuleIds,
      };

      if (wantsJson) {
        return { exitCode: 0, stdout: JSON.stringify(result, null, 2), stderr: "" };
      }

      const lines = [
        `Previous verdict: ${diff.previousVerdict}`,
        `Current verdict:  ${diff.currentVerdict}`,
        "",
      ];
      if (diff.resolvedRuleIds.length > 0) {
        lines.push(`Resolved (${diff.resolvedRuleIds.length}):`, ...diff.resolvedRuleIds.map((id) => `  + ${id}`), "");
      }
      if (diff.newRuleIds.length > 0) {
        lines.push(`New findings (${diff.newRuleIds.length}):`, ...diff.newRuleIds.map((id) => `  ! ${id}`), "");
      }
      if (diff.remainingRuleIds.length > 0) {
        lines.push(`Remaining (${diff.remainingRuleIds.length}):`, ...diff.remainingRuleIds.map((id) => `  - ${id}`));
      }
      return { exitCode: 0, stdout: lines.join("\n"), stderr: "" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Failed to recheck: ${message}`,
      };
    }
  }

  if (command === "inspect") {
    try {
      const { report, resolved } = await runInspection(input, dependencies);

      try {
        const { promises: fs } = await import("node:fs");
        await fs.mkdir(path.dirname(DEFAULT_SNAPSHOT), { recursive: true });
        await fs.writeFile(DEFAULT_SNAPSHOT, JSON.stringify(report, null, 2), "utf8");
      } catch {
        // snapshot save is best-effort
      }

      const stdout = wantsJson ? JSON.stringify(report, null, 2) : renderMarkdownReport(report);
      await resolved.cleanup?.();
      return { exitCode: 0, stdout, stderr: "" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Failed to inspect repository: ${message}`,
      };
    }
  }

  return {
    exitCode: 1,
    stdout: usage,
    stderr: "",
  };
}

export function isDirectCliInvocation(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) return false;
  return moduleUrl === pathToFileURL(path.resolve(argvPath)).href;
}

if (isDirectCliInvocation(import.meta.url, process.argv[1])) {
  runCli().then((result) => {
    if (result.stdout) process.stdout.write(`${result.stdout}\n`);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.exitCode;
  });
}
