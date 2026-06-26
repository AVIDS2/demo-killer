import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function scanForSignalHandlers(root: string): Promise<boolean> {
  const SKIP = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "target", "vendor"]);
  const EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".cs"];

  async function walk(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...await walk(full));
      else if (EXTS.some(ext => e.name.endsWith(ext))) results.push(full);
    }
    return results;
  }

  const files = await walk(root);
  for (const file of files.slice(0, 200)) {
    try {
      const text = await fs.readFile(file, "utf8");
      if (/process\.on\s*\(\s*['"]SIGTERM['"]/.test(text) ||
          /process\.on\s*\(\s*['"]SIGINT['"]/.test(text) ||
          /signal\.Notify/.test(text) ||
          /graceful[_-]?shutdown/i.test(text) ||
          /onShutdown|beforeExit/i.test(text)) {
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}

export async function gracefulShutdownRule(inventory: ProjectInventory): Promise<Finding[]> {
  if (inventory.apiRoutes.length === 0) return [];
  if (inventory.stack === "unknown") return [];

  const hasHandler = await scanForSignalHandlers(inventory.root);
  if (hasHandler) return [];

  return [{
    ruleId: "DK-OPS-001", title: "No graceful shutdown handler detected", severity: "medium", confidence: "medium",
    missingControls: ["gracefulShutdown"],
    consequence: "Without a graceful shutdown handler (SIGTERM/SIGINT), in-flight requests are dropped during deployment, causing partial writes and failed responses.",
    acceptanceCriteria: ["Server listens for SIGTERM/SIGINT and drains connections before exiting.", "Health check returns unhealthy during shutdown.", "Connection pools are closed after serving in-flight requests."],
    evidence: [{ id: "project-scan", detector: "inventory", location: { path: "." }, controls: [], signals: ["no graceful shutdown handler found in source code"] }],
  }];
}
