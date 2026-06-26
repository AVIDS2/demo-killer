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

export async function serverlessFuncFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const kind = inventory.projectKind;
  if (kind !== "serverless-func") return [];

  const jsTsFiles = await walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx"]);
  const pyFiles = await walkSourceFiles(root, [".py"]);
  const allFiles = [...jsTsFiles, ...pyFiles];

  const allContent = (await Promise.all(allFiles.map(f => readFileContent(root, f)))).join("\n");

  // DK-SLS-001: No cold start handling
  const hasColdStartHandling =
    /lazy.*init/i.test(allContent) ||
    /warm.*up/i.test(allContent) ||
    /keep.*alive/i.test(allContent) ||
    /cold.*start/i.test(allContent) ||
    /preconnect/i.test(allContent) ||
    /connection.*pool/i.test(allContent) ||
    /singleton.*db/i.test(allContent);

  if (!hasColdStartHandling) {
    findings.push({
      ruleId: "DK-SLS-001",
      title: "No cold start handling detected",
      severity: "high",
      confidence: "high",
      missingControls: ["coldStartMitigation"],
      consequence: "Serverless functions incur latency penalties on cold starts when connections and dependencies are initialized on every invocation. Without warm-up or lazy init patterns, users experience unpredictable high-latency requests, and connection-heavy workloads (databases, HTTP clients) may hit timeout limits.",
      acceptanceCriteria: [
        "Database connections and HTTP clients are initialized outside the handler (module scope) and reused across invocations.",
        "A warm-up mechanism (keep-alive pings, provisioned concurrency, or scheduled invocations) keeps instances alive.",
        "Connection pooling is configured for downstream dependencies.",
      ],
      evidence: [{ id: "sls-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no cold start handling pattern found"] }],
    });
  }

  // DK-SLS-002: Missing timeout configuration
  const hasTimeoutConfig =
    /timeout/i.test(allContent) ||
    /getRemainingTimeInMillis/i.test(allContent) ||
    /context\.deadline/i.test(allContent) ||
    /TIMEOUT/i.test(allContent) ||
    /maxExecutionTime/i.test(allContent);

  if (!hasTimeoutConfig) {
    findings.push({
      ruleId: "DK-SLS-002",
      title: "Missing timeout configuration for serverless function",
      severity: "high",
      confidence: "high",
      missingControls: ["timeoutConfig"],
      consequence: "Without explicit timeout handling, the function relies on platform defaults which may be too long (causing runaway costs) or too short (preventing legitimate work). Long-running executions from hung connections or infinite loops silently drain billing budgets with no early termination.",
      acceptanceCriteria: [
        "Function timeout is explicitly configured to match expected execution time.",
        "Handler code checks remaining execution time and fails gracefully before timeout.",
        "Downstream calls use shorter timeouts than the function timeout to allow cleanup.",
      ],
      evidence: [{ id: "sls-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no timeout configuration found"] }],
    });
  }

  // DK-SLS-003: No concurrency limit
  const hasConcurrencyLimit =
    /reservedConcurrency/i.test(allContent) ||
    /max.*concurrent/i.test(allContent) ||
    /throttl/i.test(allContent) ||
    /concurrency/i.test(allContent) ||
    /maxInstances/i.test(allContent) ||
    /max_workers/i.test(allContent);

  if (!hasConcurrencyLimit) {
    findings.push({
      ruleId: "DK-SLS-003",
      title: "No concurrency limit configured for serverless function",
      severity: "medium",
      confidence: "high",
      missingControls: ["concurrencyLimit"],
      consequence: "Unbounded concurrent executions can overwhelm downstream databases, APIs, or shared resources. A traffic spike spawns thousands of parallel instances, each opening connections and consuming resources, leading to cascading failures or cost explosion.",
      acceptanceCriteria: [
        "Concurrency is bounded via reserved concurrency or max instances configuration.",
        "Throttling behavior is defined for when the limit is reached.",
        "Downstream resource capacity is validated against the concurrency limit.",
      ],
      evidence: [{ id: "sls-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no concurrency limit found"] }],
    });
  }

  // DK-SLS-004: Non-idempotent event handler
  const hasIdempotency =
    /idempoten/i.test(allContent) ||
    /dedup/i.test(allContent) ||
    /event.*id/i.test(allContent) ||
    /message.*id/i.test(allContent) ||
    /request.*id.*check/i.test(allContent) ||
    /processed.*events/i.test(allContent);

  if (!hasIdempotency) {
    findings.push({
      ruleId: "DK-SLS-004",
      title: "Non-idempotent event handler",
      severity: "high",
      confidence: "high",
      missingControls: ["idempotency"],
      consequence: "Serverless platforms may invoke the same function multiple times for a single event due to retries, at-least-once delivery semantics, or infrastructure glitches. Without idempotency, this causes duplicate database writes, double charges, repeated notifications, or corrupted state.",
      acceptanceCriteria: [
        "Event handlers check for duplicate event/message IDs before processing.",
        "Processed event IDs are tracked in a persistent store (database, Redis, DynamoDB).",
        "Operations are designed to be idempotent by default where possible.",
      ],
      evidence: [{ id: "sls-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no idempotency check found in event handler"] }],
    });
  }

  return findings;
}
