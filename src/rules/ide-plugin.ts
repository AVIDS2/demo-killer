import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function walkSourceFiles(root: string, exts: string[]): Promise<string[]> {
  const SKIP = new Set(["node_modules","dist","build",".git","__pycache__","target","vendor"]);
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

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

export async function idePluginFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "ide-plugin") return [];
  const files = await walkSourceFiles(root, [".ts",".tsx",".js",".jsx"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-IDE-001 (high,medium): Workspace trust bypass - check workspace.*trust with bypass/ignore/skip/override
  if (/workspace[\s\S]{0,40}trust/i.test(allContent) && /bypass|ignore|skip|override/i.test(allContent)) {
    findings.push({
      ruleId: "DK-IDE-001",
      title: "Workspace trust bypass detected",
      severity: "high",
      confidence: "medium",
      missingControls: [
        "Respect workspace trust boundaries without bypass mechanisms",
        "Remove or disable trust override flags"
      ],
      consequence: "A malicious workspace can bypass trust checks and execute code automatically when opened, leading to arbitrary code execution on the user's machine.",
      acceptanceCriteria: [
        "Workspace trust checks cannot be bypassed or overridden programmatically",
        "Extension functionality degrades gracefully in untrusted workspaces"
      ],
      evidence: [{
        id: "IDE-001-1",
        detector: "pattern-match",
        location: { path: "(workspace trust + bypass pattern detected in source)" },
        controls: [],
        signals: ["workspace.*trust pattern matched", "bypass/ignore/skip/override keyword present"]
      }]
    });
  }

  // DK-IDE-002 (blocker,high): Arbitrary command execution - check child_process/exec/execSync/spawn/shell.exec without sandbox/allowlist
  if (/(child_process|execSync|shell\.exec|\.exec\(|\.spawn\()/i.test(allContent) && !/(sandbox|allowlist|whitelist|approved[_-]?commands)/i.test(allContent)) {
    findings.push({
      ruleId: "DK-IDE-002",
      title: "Arbitrary command execution without sandbox or allowlist",
      severity: "blocker",
      confidence: "medium",
      missingControls: [
        "Implement a command allowlist to restrict executable commands",
        "Use a sandboxed execution environment for shell commands",
        "Validate and sanitize all command inputs before execution"
      ],
      consequence: "The extension can execute arbitrary system commands, allowing an attacker who controls workspace files or input to achieve full remote code execution on the user's machine.",
      acceptanceCriteria: [
        "All shell command invocations are restricted to an explicit allowlist",
        "User-facing inputs are sanitized before being passed to any command executor",
        "No raw user or file content is interpolated into shell commands"
      ],
      evidence: [{
        id: "IDE-002-1",
        detector: "pattern-match",
        location: { path: "(child_process/exec/spawn usage detected in source)" },
        controls: [],
        signals: ["child_process or exec/spawn pattern matched", "no sandbox/allowlist/whitelist pattern found"]
      }]
    });
  }

  // DK-IDE-003 (medium,medium): Network without consent - check fetch/axios/request/https.get without user.*consent/opt.in/telemetry.*opt
  if (/(fetch\(|axios\.|https?\.get|request\(|XMLHttpRequest)/i.test(allContent) && !/(user[\s\S]{0,30}consent|opt[\s-]?in|telemetry[\s\S]{0,20}opt|ask[\s\S]{0,20}permission)/i.test(allContent)) {
    findings.push({
      ruleId: "DK-IDE-003",
      title: "Network request without user consent",
      severity: "medium",
      confidence: "medium",
      missingControls: [
        "Prompt the user for consent before making network requests",
        "Provide an opt-in mechanism for telemetry or data collection",
        "Document all network endpoints the extension communicates with"
      ],
      consequence: "The extension sends data over the network without the user's knowledge or consent, potentially leaking workspace contents, usage data, or other sensitive information.",
      acceptanceCriteria: [
        "All network requests require explicit user consent or are opt-in",
        "Telemetry and reporting features are disabled by default and require opt-in",
        "Network endpoints are documented in the extension manifest"
      ],
      evidence: [{
        id: "IDE-003-1",
        detector: "pattern-match",
        location: { path: "(network request without consent pattern detected in source)" },
        controls: [],
        signals: ["fetch/axios/request pattern matched", "no user consent/opt-in pattern found"]
      }]
    });
  }

  return findings;
}
