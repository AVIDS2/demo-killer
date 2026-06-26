import { promises as fs } from "node:fs";
import path from "node:path";
import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";

// ─── CLI entry point discovery ────────────────────────────────────

async function findCliEntryPoints(root: string): Promise<string[]> {
  const entryPoints: string[] = [];

  // 1. Read package.json "bin" field
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    if (pkg.bin) {
      const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin) as string[];
      for (const bin of bins) {
        entryPoints.push(bin as string);
      }
    }
    // Also check "main" if it looks like a CLI (has shebang or process.argv)
    if (pkg.main) {
      entryPoints.push(pkg.main);
    }
  } catch { /* no package.json */ }

  // 2. Look for common CLI entry patterns
  const candidates = [
    "src/cli.ts", "src/cli.js", "src/cli.mts", "src/cli.mjs",
    "src/index.ts", "src/index.js", "src/main.ts", "src/main.js",
    "cli.ts", "cli.js", "index.ts", "index.js", "main.ts", "main.js",
    "bin/cli.ts", "bin/cli.js", "bin/index.ts", "bin/index.js",
  ];
  for (const c of candidates) {
    try {
      await fs.access(path.join(root, c));
      if (!entryPoints.includes(c)) entryPoints.push(c);
    } catch { /* not found */ }
  }

  // Deduplicate
  return [...new Set(entryPoints)];
}

async function readEntryPoints(root: string, entryPoints: string[]): Promise<{ filePath: string; content: string }[]> {
  const results: { filePath: string; content: string }[] = [];
  for (const ep of entryPoints) {
    try {
      const content = await fs.readFile(path.join(root, ep), "utf8");
      results.push({ filePath: ep, content });
    } catch { /* skip unreadable files */ }
  }
  return results;
}

// ─── Helper: aggregate all CLI source into one string for checks ──

function aggregateSource(files: { filePath: string; content: string }[]): string {
  return files.map(f => f.content).join("\n");
}

// ─── Detection helpers ────────────────────────────────────────────

function usesCliFramework(content: string): boolean {
  return /require\s*\(\s*['"]commander['"]\b/.test(content) ||
    /from\s+['"]commander['"]/.test(content) ||
    /require\s*\(\s*['"]yargs['"]\b/.test(content) ||
    /from\s+['"]yargs['"]/.test(content) ||
    /require\s*\(\s*['"]cac['"]\b/.test(content) ||
    /from\s+['"]cac['"]/.test(content) ||
    /require\s*\(\s*['"]clipanion['"]\b/.test(content) ||
    /from\s+['"]clipanion['"]/.test(content) ||
    /require\s*\(\s*['"]oclif['"]\b/.test(content) ||
    /from\s+['"]oclif['"]/.test(content) ||
    /from\s+['"]@oclif/.test(content) ||
    /require\s*\(\s*['"]@oclif/.test(content);
}

function readsProcessArgv(content: string): boolean {
  return /process\.argv/.test(content) || /process\.argv\.slice\s*\(\s*2\s*\)/.test(content);
}

function hasArgValidation(content: string): boolean {
  // Schema validation libraries
  if (/\.safeParse\s*\(/.test(content) || /\.parse\s*\(/.test(content) && /zod|yup|joi|ajv/i.test(content)) return true;
  if (/z\.object\s*\(/.test(content) || /yup\.object\s*\(/.test(content) || /Joi\.object\s*\(/.test(content)) return true;

  // Commander/yargs option validation
  if (/\.\s*option\s*\(/.test(content) && (/\.\s*argParser\s*\(/.test(content) || /validate\s*\(/.test(content) || /\brequired\s*(?:\(\s*\)|= true|\s*:\s*true)/.test(content))) return true;
  if (/\.\s*argument\s*\(/.test(content) && /\.\s*argParser\s*\(/.test(content)) return true;

  // Custom validation patterns
  if (/if\s*\(\s*!/.test(content) && (/args?\[/.test(content) || /argv\[/.test(content) || /url|input|path|file/i.test(content))) return true;

  // Yargs .demandCommand, .check
  if (/\.\s*(demandCommand|required\(\)|check\s*\()/.test(content)) return true;

  return false;
}

function hasSignalHandlers(content: string): boolean {
  return /process\.on\s*\(\s*['"]SIGTERM['"]/.test(content) ||
    /process\.on\s*\(\s*['"]SIGINT['"]/.test(content) ||
    /process\.on\s*\(\s*['"]SIGHUP['"]/.test(content) ||
    /signal\.Notify/.test(content) ||
    /os\.signal/.test(content);
}

function hasErrorExitCodes(content: string): boolean {
  const hasNonZeroExit = /process\.exit\s*\(\s*(?!0\s*\))[^)]+\)/.test(content) ||
    /process\.exitCode\s*=\s*(?!0\b)/.test(content) ||
    /os\.Exit\s*\(\s*(?!0\s*\))[^)]+\)/.test(content) ||
    /throw\s+new\s+Error/.test(content) ||
    /process\.exit\s*\(\s*1\s*\)/.test(content);
  return hasNonZeroExit;
}

function hasOnlyZeroExit(content: string): boolean {
  const hasExitCall = /process\.exit\s*\(/.test(content);
  if (!hasExitCall) return false;
  // All exit calls use 0
  const exitCalls = content.match(/process\.exit\s*\(\s*(\d+)\s*\)/g) ?? [];
  return exitCalls.length > 0 && exitCalls.every(c => /process\.exit\s*\(\s*0\s*\)/.test(c));
}

function hasHelpMechanism(content: string): boolean {
  // Frameworks that auto-generate help
  if (usesCliFramework(content)) return true;
  // Manual help
  if (/--help/.test(content) || /--version/.test(content)) return true;
  if (/\.version\s*\(/.test(content)) return true;
  if (/argparse|optparse|getopt|flag\.\w+\s*\(/.test(content)) return true;
  return false;
}

function hasUnsafeStdin(content: string): boolean {
  return /readFileSync\s*\(\s*0\s*[,\)]/.test(content) ||
    /readFileSync\s*\(\s*['"]\/dev\/stdin['"]/.test(content) ||
    /readFileSync\s*\(\s*process\.stdin/.test(content) ||
    /readFileSync\s*\(\s*\/dev\/fd\/0/.test(content);
}

function hasStdinSizeLimit(content: string): boolean {
  return /maxBuffer|MAX_SIZE|size.*limit|length.*check|\.slice\s*\(\s*0\s*,\s*\d/.test(content) ||
    /bytes.*read|read.*bytes|chunked|stream.*pipe/.test(content);
}

function countArgFlags(content: string): number {
  const flags = new Set<string>();
  // Commander-style .option()
  for (const m of content.matchAll(/\.\s*option\s*\(\s*['"][^'"]*?(-\w|--[\w-]+)/g)) {
    flags.add(m[1]);
  }
  // Yargs-style .option('name')
  for (const m of content.matchAll(/\.\s*option\s*\(\s*['"]([\w-]+)['"]/g)) {
    flags.add(m[1]);
  }
  // process.argv manual flag parsing
  for (const m of content.matchAll(/['"]--([\w-]+)['"]/g)) {
    flags.add(m[1]);
  }
  return flags.size;
}

function hasConfigFileSupport(content: string): boolean {
  return /cosmiconfig|lilconfig|rc-file|\.rc\b/.test(content) ||
    /config.*\.ya?ml|\.mycli.*rc|\.config\//.test(content) ||
    /loadConfig|readConfig|getConfig|findConfig|configFile/.test(content) ||
    /JSON\.parse.*readFileSync.*config/i.test(content) ||
    /\.conf\b|\.conf\.json|\.conf\.yaml/.test(content) ||
    /confstore|configstore/.test(content);
}

// ─── Main rule function ──────────────────────────────────────────

export async function cliToolFindings(inventory: ProjectInventory): Promise<Finding[]> {
  // Only apply to CLI tool projects
  if (inventory.projectKind !== "cli-tool") return [];

  const entryPoints = await findCliEntryPoints(inventory.root);
  if (entryPoints.length === 0) return [];

  const files = await readEntryPoints(inventory.root, entryPoints);
  if (files.length === 0) return [];

  const allSource = aggregateSource(files);
  const findings: Finding[] = [];

  // DK-CLI-001: CLI entry point without argument validation
  {
    const usesArgv = readsProcessArgv(allSource);
    const usesFramework = usesCliFramework(allSource);
    const hasValidation = hasArgValidation(allSource);

    if ((usesArgv || usesFramework) && !hasValidation) {
      const signal = usesArgv
        ? "process.argv used directly without validation"
        : "CLI framework used without .option() validation or schema";
      findings.push({
        ruleId: "DK-CLI-001",
        title: "CLI entry point reads arguments without validation",
        severity: "high",
        confidence: "high",
        missingControls: ["argValidation"],
        consequence:
          "Unchecked arguments can cause crashes on unexpected input, path traversal via file arguments, injection through URL arguments, and confusing error messages for users.",
        acceptanceCriteria: [
          "Arguments are validated against expected types and formats before use.",
          "Required arguments are enforced; missing args produce a clear error with usage help.",
          "URL/file/path arguments are sanitized to prevent injection and traversal.",
          "Invalid input produces a clear error message with exit code 2, not an unhandled crash.",
        ],
        evidence: [{
          id: "cli-scan",
          detector: "cli-rule",
          location: { path: files[0].filePath },
          controls: [],
          signals: [signal],
        }],
      });
    }
  }

  // DK-CLI-002: Missing SIGTERM/SIGINT handler
  if (!hasSignalHandlers(allSource)) {
    findings.push({
      ruleId: "DK-CLI-002",
      title: "CLI tool has no SIGTERM/SIGINT signal handlers",
      severity: "high",
      confidence: "medium",
      missingControls: ["signalHandling"],
      consequence:
        "Without signal handlers, the CLI cannot clean up temp files, release file locks, close network connections, or report partial progress when interrupted (Ctrl+C or kill).",
      acceptanceCriteria: [
        "SIGINT (Ctrl+C) handler performs cleanup before exiting.",
        "SIGTERM handler closes open resources and writes partial state if applicable.",
        "Exit code follows convention: 128 + signal number for signal termination.",
        "Temp files and locks are cleaned up on any exit path.",
      ],
      evidence: [{
        id: "cli-scan",
        detector: "cli-rule",
        location: { path: files[0].filePath },
        controls: [],
        signals: ["no process.on('SIGTERM') or process.on('SIGINT') found"],
      }],
    });
  }

  // DK-CLI-003: No error exit codes
  if (hasOnlyZeroExit(allSource) || (!hasErrorExitCodes(allSource) && /process\.exit\s*\(/.test(allSource))) {
    findings.push({
      ruleId: "DK-CLI-003",
      title: "CLI tool always exits with code 0, even on errors",
      severity: "medium",
      confidence: "medium",
      missingControls: ["errorExitCodes"],
      consequence:
        "Always returning exit code 0 makes the CLI unusable in scripts, CI/CD pipelines, and shell pipelines. Error conditions are silently swallowed, hiding failures from callers.",
      acceptanceCriteria: [
        "Exit code 0 is used only for successful execution.",
        "Exit code 1 is used for general errors (missing file, network failure, etc.).",
        "Exit code 2 is used for usage/argument errors.",
        "All error paths set an appropriate non-zero exit code.",
      ],
      evidence: [{
        id: "cli-scan",
        detector: "cli-rule",
        location: { path: files[0].filePath },
        controls: [],
        signals: ["process.exit(0) called without any non-zero exit paths"],
      }],
    });
  }

  // DK-CLI-004: Missing --help/--version
  if (!hasHelpMechanism(allSource)) {
    findings.push({
      ruleId: "DK-CLI-004",
      title: "CLI tool has no --help or --version output",
      severity: "medium",
      confidence: "medium",
      missingControls: ["helpOutput"],
      consequence:
        "Without --help, users cannot discover available commands and options. Without --version, support teams cannot identify the installed version for debugging.",
      acceptanceCriteria: [
        "--help flag displays usage information with all available commands and options.",
        "--version flag displays the current version number.",
        "Running the CLI with no arguments shows usage guidance rather than a stack trace.",
        "Subcommands each have their own --help output.",
      ],
      evidence: [{
        id: "cli-scan",
        detector: "cli-rule",
        location: { path: files[0].filePath },
        controls: [],
        signals: ["no --help, --version, or CLI framework with auto-generated help"],
      }],
    });
  }

  // DK-CLI-005: Unsafe stdin reading
  if (hasUnsafeStdin(allSource) && !hasStdinSizeLimit(allSource)) {
    findings.push({
      ruleId: "DK-CLI-005",
      title: "CLI reads stdin without size limit or timeout",
      severity: "high",
      confidence: "high",
      missingControls: ["stdinSafety"],
      consequence:
        "Reading stdin without a size limit allows an attacker (or accidental pipe) to send unbounded data, causing the process to consume all available memory and crash with OOM.",
      acceptanceCriteria: [
        "stdin reading has a maximum size limit (e.g., 10 MB).",
        "stdin reading has a timeout to prevent hanging indefinitely on empty pipes.",
        "Pipe detection: if stdin is not a pipe and no --stdin flag, the CLI should not block waiting for input.",
        "Large stdin input is handled gracefully with a clear error message.",
      ],
      evidence: [{
        id: "cli-scan",
        detector: "cli-rule",
        location: { path: files[0].filePath },
        controls: [],
        signals: ["readFileSync(0) or /dev/stdin without size limit or pipe detection"],
      }],
    });
  }

  // DK-CLI-006: No config file support (many flags but no config file)
  {
    const flagCount = countArgFlags(allSource);
    const hasConfig = hasConfigFileSupport(allSource);

    if (flagCount > 3 && !hasConfig) {
      findings.push({
        ruleId: "DK-CLI-006",
        title: `CLI has ${flagCount} flags but no config file support`,
        severity: "medium",
        confidence: "medium",
        missingControls: ["configFileSupport"],
        consequence:
          "Users must pass many flags on every invocation, making the CLI cumbersome for repeated use. Configurations cannot be shared across a team or version-controlled.",
        acceptanceCriteria: [
          "CLI supports a config file (e.g., .myclirc, mycli.config.yaml) for persistent settings.",
          "Command-line flags override config file values.",
          "Config file path can be specified via --config flag or XDG_CONFIG_HOME.",
          "Config file is documented in --help output.",
        ],
        evidence: [{
          id: "cli-scan",
          detector: "cli-rule",
          location: { path: files[0].filePath },
          controls: [],
          signals: [`${flagCount} flags detected but no config file loading found`],
        }],
      });
    }
  }

  return findings;
}
