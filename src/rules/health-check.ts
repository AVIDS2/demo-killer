import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function scanForHealthEndpoint(root: string): Promise<boolean> {
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
      if (text.match(/['"]\/healthz?['"]/) ||
          text.match(/['"]\/health['"]/) ||
          text.match(/health[_-]?check/i) ||
          text.match(/\.get\s*\(\s*['"]\/health/) ||
          text.match(/\.route\s*\(\s*['"]\/health/)) {
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}

export async function healthCheckRule(inventory: ProjectInventory): Promise<Finding[]> {
  if (inventory.apiRoutes.length === 0) return [];
  if (inventory.stack === "unknown") return [];

  const hasEndpoint = await scanForHealthEndpoint(inventory.root);
  if (hasEndpoint) return [];

  return [{
    ruleId: "DK-OPS-002", title: "No health check endpoint detected", severity: "medium", confidence: "medium",
    missingControls: ["healthCheck"],
    consequence: "Without a health check endpoint, load balancers and orchestrators cannot verify the service is alive, leading to traffic being routed to unhealthy instances.",
    acceptanceCriteria: ["A /health or /healthz endpoint exists and returns 200 when healthy.", "Health check verifies critical dependencies (database, cache, external APIs).", "Health check has a timeout to prevent hanging.", "Load balancer is configured to use the health endpoint."],
    evidence: [{ id: "project-scan", detector: "inventory", location: { path: "." }, controls: [], signals: ["no /health or /healthz endpoint found in source code"] }],
  }];
}
