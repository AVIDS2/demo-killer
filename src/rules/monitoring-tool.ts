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

export async function monitoringToolFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "monitoring-tool") return [];
  const files = await walkSourceFiles(root, [".ts",".tsx",".js",".jsx",".go",".py"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-MON-001: Unauthenticated metrics endpoint
  const mon001Pattern = /\/metrics|\/actuator|\/prometheus/gi;
  const mon001AuthPattern = /auth|token|ip.*allow|middleware|authenticate|authorize/gi;
  if (mon001Pattern.test(allContent) && !mon001AuthPattern.test(allContent)) {
    findings.push({
      ruleId: "DK-MON-001",
      title: "Unauthenticated metrics endpoint",
      severity: "high",
      confidence: "medium",
      missingControls: ["Authentication on metrics endpoint", "IP allowlisting", "Token-based access"],
      consequence: "Metrics endpoints are publicly accessible without authentication, exposing internal system details, performance data, and potentially sensitive labels to unauthorized users.",
      acceptanceCriteria: [
        "Add authentication middleware to /metrics, /actuator, and /prometheus endpoints",
        "Restrict access by IP allowlist or network policy",
        "Document required access controls for metrics endpoints"
      ],
      evidence: [{
        id: "mon-001-metrics-no-auth",
        detector: "pattern-match",
        location: { path: "server.js" },
        controls: [],
        signals: ["metrics endpoint found without authentication middleware"]
      }]
    });
  }

  // DK-MON-002: Sensitive data in health checks
  const mon002Pattern = /\/health|\/healthz|\/readyz/gi;
  const mon002Sensitive = /env|secrets|db.*url|password|api.*key|process\.env/gi;
  if (mon002Pattern.test(allContent) && mon002Sensitive.test(allContent)) {
    findings.push({
      ruleId: "DK-MON-002",
      title: "Sensitive data exposed in health check responses",
      severity: "high",
      confidence: "medium",
      missingControls: ["Sanitize health check responses", "Remove environment variables from output", "Separate liveness from readiness probes"],
      consequence: "Health check endpoints expose sensitive environment variables (database URLs, API keys, passwords) in their JSON responses, which can be accessed by anyone who can reach the endpoint.",
      acceptanceCriteria: [
        "Remove all environment variables and secrets from health check response bodies",
        "Return only status indicators (ok/degraded/down) in health checks",
        "Use separate endpoints for liveness (simple status) and readiness (dependency checks without leaking credentials)"
      ],
      evidence: [{
        id: "mon-002-health-leaks-secrets",
        detector: "pattern-match",
        location: { path: "server.js" },
        controls: [],
        signals: ["health endpoint exposes process.env variables including DATABASE_URL and API_KEY"]
      }]
    });
  }

  // DK-MON-003: Metric cardinality explosion
  const mon003Pattern = /counter|gauge|histogram|metric/gi;
  const mon003Labels = /user.*id|request.*id|session.*id/gi;
  if (mon003Pattern.test(allContent) && mon003Labels.test(allContent)) {
    findings.push({
      ruleId: "DK-MON-003",
      title: "Metric cardinality explosion risk from high-cardinality labels",
      severity: "medium",
      confidence: "medium",
      missingControls: ["Label value sanitization", "Cardinality limits", "Use bounded label sets"],
      consequence: "Using high-cardinality values like user_id, request_id, or session_id as metric labels causes unbounded growth in time series, leading to memory exhaustion and storage overflow in the monitoring backend.",
      acceptanceCriteria: [
        "Remove or bound high-cardinality labels (user_id, request_id, session_id) from metric definitions",
        "Use aggregated labels (e.g., user_tier, request_type) instead of raw identifiers",
        "Configure cardinality limits in the metrics library or scraping configuration"
      ],
      evidence: [{
        id: "mon-003-high-cardinality-labels",
        detector: "pattern-match",
        location: { path: "server.js" },
        controls: [],
        signals: ["metrics defined with high-cardinality labels such as user_id or session_id"]
      }]
    });
  }

  // DK-MON-004: Missing metric retention policy
  const mon004Pattern = /metrics|register|collect|scrape/gi;
  const mon004Retention = /retention|expire|ttl|window|maxAge|max_age/gi;
  if (mon004Pattern.test(allContent) && !mon004Retention.test(allContent)) {
    findings.push({
      ruleId: "DK-MON-004",
      title: "No metric retention policy configured",
      severity: "medium",
      confidence: "medium",
      missingControls: ["Metric retention configuration", "TTL on collected data", "Storage window limits"],
      consequence: "Without a retention policy, metrics accumulate indefinitely, consuming increasing amounts of storage and slowing down queries over time.",
      acceptanceCriteria: [
        "Configure a retention period for collected metrics (e.g., 30 days for raw, 1 year for aggregated)",
        "Set TTL or expiration on metric storage backend",
        "Document retention policy and storage projections"
      ],
      evidence: [{
        id: "mon-004-no-retention",
        detector: "pattern-match",
        location: { path: "server.js" },
        controls: [],
        signals: ["metric collection found without any retention/expiration configuration"]
      }]
    });
  }

  return findings;
}
