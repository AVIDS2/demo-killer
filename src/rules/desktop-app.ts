import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

async function walkSourceFiles(root: string, exts: string[]): Promise<string[]> {
  const SKIP = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "target", "vendor"]);
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (exts.some(ext => e.name.endsWith(ext))) results.push(path.relative(root, full));
    }
  }
  await walk(root);
  return results;
}

export async function desktopAppFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const kind = inventory.projectKind;
  if (kind !== "desktop-app") return [];

  const jsTsFiles = await walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx"]);
  const pyFiles = await walkSourceFiles(root, [".py"]);
  const allFiles = [...jsTsFiles, ...pyFiles];

  const allContent = (await Promise.all(allFiles.map(f => readFileContent(root, f)))).join("\n");

  // DK-DESK-001: No auto-update mechanism
  const hasAutoUpdate =
    /autoUpdater/i.test(allContent) ||
    /electron-updater/i.test(allContent) ||
    /update.*electron/i.test(allContent) ||
    /checkForUpdates/i.test(allContent) ||
    /NSUpdater/i.test(allContent) ||
    /tauri.*update/i.test(allContent) ||
    /update\.download/i.test(allContent) ||
    /auto.*update/i.test(allContent);

  if (!hasAutoUpdate) {
    findings.push({
      ruleId: "DK-DESK-001",
      title: "No auto-update mechanism detected",
      severity: "high",
      confidence: "high",
      missingControls: ["autoUpdate"],
      consequence: "Users will remain on outdated versions indefinitely, missing critical security patches and bug fixes. Manual update distribution is error-prone and leads to fragmented user versions, making support difficult and leaving known vulnerabilities unpatched.",
      acceptanceCriteria: [
        "An auto-update mechanism is integrated (e.g., electron-updater, Tauri updater, Sparkle).",
        "Update checks run on application startup or at regular intervals.",
        "Users are notified of available updates with option to install or defer.",
        "Failed updates are handled gracefully with rollback capability.",
      ],
      evidence: [{ id: "desk-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no auto-update mechanism found"] }],
    });
  }

  // DK-DESK-002: Node integration enabled in renderer (Electron security issue)
  const hasDangerousNodeIntegration =
    /nodeIntegration\s*:\s*true/i.test(allContent) ||
    /nodeIntegration\s*:\s*1/i.test(allContent) ||
    /contextIsolation\s*:\s*false/i.test(allContent);

  if (hasDangerousNodeIntegration) {
    findings.push({
      ruleId: "DK-DESK-002",
      title: "Node integration enabled in renderer process",
      severity: "blocker",
      confidence: "high",
      missingControls: ["contextIsolation", "sandboxedRenderer"],
      consequence: "With nodeIntegration enabled or contextIsolation disabled, any XSS vulnerability in the renderer process grants the attacker full access to the Node.js runtime, including the filesystem, child processes, and network. This effectively gives remote code execution on the user's machine from a simple web content injection.",
      acceptanceCriteria: [
        "nodeIntegration is set to false in all BrowserWindow configurations.",
        "contextIsolation is set to true (default since Electron 12).",
        "Communication between renderer and main process uses contextBridge with a minimal, typed API.",
        "Renderer process runs in a sandboxed environment with no direct Node.js access.",
      ],
      evidence: [{ id: "desk-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["nodeIntegration enabled or contextIsolation disabled in renderer"] }],
    });
  }

  // DK-DESK-003: No crash reporting
  const hasCrashReporting =
    /crashReporter/i.test(allContent) ||
    /sentry.*electron/i.test(allContent) ||
    /electron.*crash/i.test(allContent) ||
    /minidump/i.test(allContent) ||
    /breakpad/i.test(allContent) ||
    /bugsnag.*electron/i.test(allContent) ||
    /error.*reporting/i.test(allContent);

  if (!hasCrashReporting) {
    findings.push({
      ruleId: "DK-DESK-003",
      title: "No crash reporting mechanism detected",
      severity: "medium",
      confidence: "high",
      missingControls: ["crashReporting"],
      consequence: "Application crashes occur silently with no telemetry. Developers have no visibility into production stability, cannot prioritize fixes for the most common crashes, and are unable to detect regressions introduced in new releases. Users who experience crashes have no path to resolution other than filing manual bug reports.",
      acceptanceCriteria: [
        "A crash reporting service is integrated (e.g., Sentry, Bugsnag, Electron crashReporter).",
        "Crash reports include relevant context (app version, OS, stack trace).",
        "Crash reports are uploaded automatically when the application restarts after a crash.",
        "Crash data is monitored and actionable alerts are configured.",
      ],
      evidence: [{ id: "desk-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no crash reporting mechanism found"] }],
    });
  }

  // DK-DESK-004: IPC messages not validated
  const hasIPC =
    /ipcMain\.on/i.test(allContent) ||
    /ipcMain\.handle/i.test(allContent) ||
    /ipcRenderer\.send/i.test(allContent) ||
    /ipcRenderer\.invoke/i.test(allContent);

  const hasIPCValidation =
    /ipcMain\.handle.*validate|validate.*ipcMain\.handle/i.test(allContent) ||
    /schema\s*\.\s*(parse|validate|safeParse)/i.test(allContent) ||
    /zod|yup|joi|ajv|superstruct/i.test(allContent) &&
      hasIPC ||
    /allowed[_-]?channels/i.test(allContent) ||
    /channel[_-]?whitelist/i.test(allContent) ||
    /ipc[_-]?validation/i.test(allContent) ||
    /input[_-]?validat/i.test(allContent) ||
    /typeof\s+args\s*===/i.test(allContent) ||
    /args\s*instanceof/i.test(allContent) ||
    /\bvalidate\w*\s*\(\s*(?:args|payload|data|message|channel)\b/i.test(allContent);

  if (hasIPC && !hasIPCValidation) {
    findings.push({
      ruleId: "DK-DESK-004",
      title: "IPC messages not validated",
      severity: "high",
      confidence: "high",
      missingControls: ["ipcValidation", "channelWhitelist"],
      consequence: "Unvalidated IPC channels expose the main process to arbitrary input from renderer processes. An attacker who compromises the renderer (e.g., via XSS) can invoke any registered IPC handler with crafted payloads, potentially leading to arbitrary file access, command execution, or privilege escalation through the main process.",
      acceptanceCriteria: [
        "All IPC message handlers validate input payloads against a schema before processing.",
        "IPC channel names are whitelisted and unrecognized channels are rejected.",
        "Renderer-accessible IPC APIs are minimal and follow the principle of least privilege.",
        "Sensitive IPC operations require additional confirmation or authentication.",
      ],
      evidence: [{ id: "desk-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["IPC usage detected without validation patterns"] }],
    });
  }

  return findings;
}
