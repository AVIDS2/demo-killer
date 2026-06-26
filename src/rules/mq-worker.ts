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

export async function mqWorkerFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const kind = inventory.projectKind;
  if (kind !== "mq-worker") return [];

  const jsTsFiles = await walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx"]);
  const pyFiles = await walkSourceFiles(root, [".py"]);
  const allFiles = [...jsTsFiles, ...pyFiles];

  const allContent = (await Promise.all(allFiles.map(f => readFileContent(root, f)))).join("\n");

  // DK-MQ-001: Message handler without idempotency check
  const hasIdempotency =
    /idempoten/i.test(allContent) ||
    /message[_-]?id\s*[=:]/i.test(allContent) ||
    /processed[_-]?ids?\s*[=:]/i.test(allContent) ||
    /dedup/i.test(allContent) ||
    /seen[_-]?messages?\s*[=:]/i.test(allContent);

  if (!hasIdempotency) {
    findings.push({
      ruleId: "DK-MQ-001",
      title: "Message handler without idempotency protection",
      severity: "blocker",
      confidence: "high",
      missingControls: ["idempotency"],
      consequence: "Message brokers may deliver the same message multiple times (at-least-once delivery). Without idempotency, this causes duplicate processing — double charges, duplicate records, or corrupted state.",
      acceptanceCriteria: [
        "Message handlers check for duplicate message IDs before processing.",
        "Processed message IDs are tracked in a persistent store (database, Redis).",
        "Idempotent operations are preferred over side-effectful processing.",
      ],
      evidence: [{ id: "mq-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no idempotency check found"] }],
    });
  }

  // DK-MQ-002: No dead letter queue / DLQ handling
  const hasDLQ =
    /dead[_-]?letter/i.test(allContent) ||
    /\bdlq\b/i.test(allContent) ||
    /deadLetter/i.test(allContent) ||
    /failed[_-]?queue/i.test(allContent) ||
    /error[_-]?queue/i.test(allContent);

  if (!hasDLQ) {
    findings.push({
      ruleId: "DK-MQ-002",
      title: "No dead letter queue handling detected",
      severity: "high",
      confidence: "medium",
      missingControls: ["deadLetterQueue"],
      consequence: "Poison messages (unparseable, permanently failing) will block the queue and prevent processing of valid messages. Without a DLQ, failed messages are lost or retried infinitely.",
      acceptanceCriteria: [
        "Failed messages are routed to a dead letter queue after max retries.",
        "DLQ messages are monitored and alerting is configured.",
        "DLQ has a manual review/replay mechanism.",
      ],
      evidence: [{ id: "mq-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no dead letter queue found"] }],
    });
  }

  // DK-MQ-003: No retry backoff strategy
  const hasRetryBackoff =
    /retry[_-]?count/i.test(allContent) ||
    /max[_-]?retries/i.test(allContent) ||
    /backoff/i.test(allContent) ||
    /exponential/i.test(allContent) ||
    /retryDelay/i.test(allContent) ||
    /attempt\s*[<>]=?\s*\d/.test(allContent);

  if (!hasRetryBackoff) {
    findings.push({
      ruleId: "DK-MQ-003",
      title: "No retry backoff strategy for message processing",
      severity: "high",
      confidence: "medium",
      missingControls: ["retryBackoff"],
      consequence: "Failed messages are retried immediately without backoff, overwhelming downstream services and causing cascading failures. No retry limit means infinite retry loops.",
      acceptanceCriteria: [
        "Retries use exponential backoff with jitter.",
        "Maximum retry count is configured.",
        "Failed retries are routed to DLQ after max attempts.",
      ],
      evidence: [{ id: "mq-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no retry backoff found"] }],
    });
  }

  // DK-MQ-004: No concurrency limit on workers
  const hasConcurrencyLimit =
    /concurrency\s*[=:]\s*\d/.test(allContent) ||
    /max[_-]?concurrent/i.test(allContent) ||
    /parallelism/i.test(allContent) ||
    /prefetch[_-]?count/i.test(allContent) ||
    /worker[_-]?pool[_-]?size/i.test(allContent) ||
    /maxWorkers/i.test(allContent);

  if (!hasConcurrencyLimit) {
    findings.push({
      ruleId: "DK-MQ-004",
      title: "No concurrency limit on message workers",
      severity: "medium",
      confidence: "medium",
      missingControls: ["concurrencyLimit"],
      consequence: "Unbounded concurrency can overwhelm downstream services, exhaust database connections, or cause memory pressure. A burst of messages could spawn thousands of concurrent handlers.",
      acceptanceCriteria: [
        "Worker concurrency is bounded by a configured limit.",
        "Prefetch count is set appropriately for the processing speed.",
        "Resource limits (memory, connections) are enforced per worker.",
      ],
      evidence: [{ id: "mq-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no concurrency limit found"] }],
    });
  }

  // DK-MQ-005: No graceful shutdown for message consumers
  const hasGracefulShutdown =
    /SIGTERM/i.test(allContent) ||
    /SIGINT/i.test(allContent) ||
    /graceful[_-]?shutdown/i.test(allContent) ||
    /drain/i.test(allContent) ||
    /onShutdown/i.test(allContent) ||
    /process\.on\s*\(\s*['"]exit/.test(allContent);

  if (!hasGracefulShutdown) {
    findings.push({
      ruleId: "DK-MQ-005",
      title: "Message consumer without graceful shutdown",
      severity: "high",
      confidence: "medium",
      missingControls: ["gracefulShutdown"],
      consequence: "During deployment or scaling, in-flight messages are lost when the worker process terminates abruptly. This causes message loss and potential duplicate processing on restart.",
      acceptanceCriteria: [
        "Worker handles SIGTERM and drains in-flight messages before exiting.",
        "Unacknowledged messages are requeued on shutdown.",
        "Shutdown timeout is configured to allow message completion.",
      ],
      evidence: [{ id: "mq-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no graceful shutdown for message consumer"] }],
    });
  }

  // DK-MQ-006: No message validation/schema checking
  const hasMessageValidation =
    /schema\s*\.?\s*(parse|validate|safeParse)/i.test(allContent) ||
    /zod|yup|joi|ajv|superstruct/i.test(allContent) ||
    /JSON\.parse.*try/i.test(allContent) ||
    /message[_-]?schema/i.test(allContent) ||
    /validateMessage/i.test(allContent);

  if (!hasMessageValidation) {
    findings.push({
      ruleId: "DK-MQ-006",
      title: "Message payload not validated before processing",
      severity: "high",
      confidence: "medium",
      missingControls: ["inputValidation"],
      consequence: "Malformed or unexpected message payloads can crash the worker or cause data corruption. Without schema validation, bad messages are processed blindly.",
      acceptanceCriteria: [
        "Message payloads are validated against a schema before processing.",
        "Invalid messages are routed to DLQ with error details.",
        "Schema evolution is handled gracefully (versioning or defaults).",
      ],
      evidence: [{ id: "mq-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no message validation found"] }],
    });
  }

  return findings;
}
