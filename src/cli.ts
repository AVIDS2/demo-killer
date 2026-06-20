#!/usr/bin/env node
import { analyzeFindings } from "./rules/index.js";
import { buildInventory } from "./inventory.js";
import { loadBenchmarkManifest } from "./benchmark.js";
import { initializeProject } from "./init.js";
import { runBenchmarkSuite } from "./benchmark-runner.js";
import { buildJsonReport } from "./report/json.js";
import { renderBenchmarkMarkdown } from "./report/benchmark-markdown.js";
import { renderMarkdownReport } from "./report/markdown.js";
import { resolveRepository } from "./repository.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Finding } from "./types.js";
import type { ResolvedRepository } from "./repository.js";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliDependencies {
  resolveRepository(input: string): Promise<ResolvedRepository>;
  analyzeFindings(root: string): Promise<Finding[]>;
  hasSupportedProjectEvidence(root: string): Promise<boolean>;
}

const defaultDependencies: CliDependencies = {
  resolveRepository,
  analyzeFindings,
  hasSupportedProjectEvidence: async (root) => {
    const inventory = await buildInventory(root);
    return inventory.stack === "nextjs" && inventory.apiRoutes.length > 0;
  },
};

const usage = [
  "Usage: demokiller init [project-root]",
  "       demokiller inspect [project-root-or-github-url] [--json|--markdown]",
  "       demokiller benchmark [manifest-path]",
].join("\n");

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
          const findings = await dependencies.analyzeFindings(resolved.root);
          const hasSupportedProjectEvidence = await dependencies.hasSupportedProjectEvidence(
            resolved.root,
          );
          return buildJsonReport(findings, new Date().toISOString(), {
            hasSupportedProjectEvidence,
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

  if (command !== "inspect") {
    return {
      exitCode: 1,
      stdout: usage,
      stderr: "",
    };
  }

  try {
    const resolved = await dependencies.resolveRepository(input);
    try {
      const findings = await dependencies.analyzeFindings(resolved.root);
      const hasSupportedProjectEvidence = await dependencies.hasSupportedProjectEvidence(
        resolved.root,
      );
      const report = buildJsonReport(findings, new Date().toISOString(), {
        hasSupportedProjectEvidence,
      });
      const stdout = wantsJson ? JSON.stringify(report, null, 2) : renderMarkdownReport(report);

      return { exitCode: 0, stdout, stderr: "" };
    } finally {
      await resolved.cleanup?.();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Failed to inspect repository: ${message}`,
    };
  }
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
