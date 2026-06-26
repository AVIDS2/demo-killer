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

export async function cronJobFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const kind = inventory.projectKind;
  if (kind !== "cron-job") return [];

  const jsTsFiles = await walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx"]);
  const pyFiles = await walkSourceFiles(root, [".py"]);
  const allFiles = [...jsTsFiles, ...pyFiles];

  const allContent = (await Promise.all(allFiles.map(f => readFileContent(root, f)))).join("\n");

  // ─── Signal detectors ──────────────────────────────────────────

  const hasOverlapPrevention =
    /distributed\s+lock/i.test(allContent) ||
    /advisory\s+lock/i.test(allContent) ||
    /\bmutex\b/i.test(allContent) ||
    /\bLOCK\b/.test(allContent) ||
    /file\s+lock/i.test(allContent) ||
    /\bflock\b/i.test(allContent) ||
    /\bredlock\b/i.test(allContent);

  const hasDbMutations =
    /\.update\s*\(/i.test(allContent) ||
    /\.delete\s*\(/i.test(allContent) ||
    /\.insert\s*\(/i.test(allContent) ||
    /\.create\s*\(/i.test(allContent) ||
    /\.save\s*\(/i.test(allContent) ||
    /\bINSERT\s+INTO\b/i.test(allContent) ||
    /\bUPDATE\s+\w+\s+SET\b/i.test(allContent) ||
    /\bDELETE\s+FROM\b/i.test(allContent) ||
    /\.exec\s*\(/i.test(allContent) ||
    /\.execute\s*\(/i.test(allContent);

  const hasTimeout =
    /\bsetTimeout\b/i.test(allContent) ||
    /\btimeout\b/i.test(allContent) ||
    /AbortSignal\.timeout/i.test(allContent) ||
    /\bdeadline\b/i.test(allContent);

  const hasFailureAlerting =
    /\balert\b/i.test(allContent) ||
    /\bnotify\b/i.test(allContent) ||
    /\bwebhook\b/i.test(allContent) ||
    /\bpager\b/i.test(allContent) ||
    /\bslack\b/i.test(allContent) ||
    /email.*error/i.test(allContent) ||
    /\bsentry\b/i.test(allContent) ||
    /catch.*log/i.test(allContent);

  const hasIdempotency =
    /\bidempoten/i.test(allContent) ||
    /\bdedup\b/i.test(allContent) ||
    /unique.*key/i.test(allContent) ||
    /\bON\s+CONFLICT\b/i.test(allContent) ||
    /\bupsert\b/i.test(allContent) ||
    /INSERT.*ON\s+DUPLICATE/i.test(allContent);

  // DK-CRON-001: Overlap prevention for distributed execution
  if (!hasOverlapPrevention && hasDbMutations) {
    findings.push({
      ruleId: "DK-CRON-001",
      title: "Cron job missing distributed lock / overlap prevention",
      severity: "high",
      confidence: "high",
      missingControls: ["distributedLock"],
      consequence: "Multiple instances of the cron job may execute simultaneously across replicas or after a restart. Without overlap prevention, concurrent runs cause duplicate database mutations, race conditions, corrupted state, or double-charging.",
      acceptanceCriteria: [
        "Cron job acquires a distributed lock (advisory lock, Redlock, mutex, or file lock) before starting work.",
        "Lock is held for the duration of the job and released on completion or failure.",
        "If the lock cannot be acquired, the job exits gracefully without side effects.",
      ],
      evidence: [{ id: "cron-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no distributed lock or overlap prevention detected", "DB mutation operations found"] }],
    });
  }

  // DK-CRON-002: No timeout handling
  if (!hasTimeout) {
    findings.push({
      ruleId: "DK-CRON-002",
      title: "Cron job has no timeout handling",
      severity: "high",
      confidence: "high",
      missingControls: ["timeout"],
      consequence: "A cron job that hangs (e.g., waiting on a dead database connection or stalled HTTP call) will run indefinitely, blocking the next scheduled execution, holding locks, and consuming resources without producing results.",
      acceptanceCriteria: [
        "Cron job has a maximum execution timeout that aborts the run if exceeded.",
        "Timeout mechanism cancels in-progress IO operations (AbortSignal.timeout, deadline, etc.).",
        "On timeout, the job logs the failure and releases any held resources or locks.",
      ],
      evidence: [{ id: "cron-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no timeout handling detected"] }],
    });
  }

  // DK-CRON-003: No failure alerting
  if (hasDbMutations && !hasFailureAlerting) {
    findings.push({
      ruleId: "DK-CRON-003",
      title: "Cron job performs DB/IO operations without failure alerting",
      severity: "medium",
      confidence: "high",
      missingControls: ["failureAlerting"],
      consequence: "Silent cron job failures go unnoticed. When a cron job that performs database or IO operations fails without alerting, data drift, missed backups, stale caches, or broken pipelines accumulate undetected until a user-facing incident occurs.",
      acceptanceCriteria: [
        "Cron job failures trigger a notification (Slack, email, PagerDuty, webhook, or Sentry).",
        "Uncaught exceptions are captured and reported with job name and error details.",
        "Alerting includes sufficient context (job name, timestamp, error stack) for diagnosis.",
      ],
      evidence: [{ id: "cron-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["DB/IO operations found", "no failure alerting pattern detected"] }],
    });
  }

  // DK-CRON-004: Non-idempotent cron job
  if (hasDbMutations && !hasIdempotency) {
    findings.push({
      ruleId: "DK-CRON-004",
      title: "Cron job mutates state without idempotency protection",
      severity: "high",
      confidence: "high",
      missingControls: ["idempotency"],
      consequence: "If the cron job runs more than once (manual trigger, overlap, retry after crash), non-idempotent mutations create duplicate records, double-charge customers, or corrupt data. Without idempotency, each execution has unpredictable side effects.",
      acceptanceCriteria: [
        "Cron job uses idempotency keys, upserts, or ON CONFLICT clauses to prevent duplicate mutations.",
        "State changes are safe to repeat — the same input produces the same output regardless of execution count.",
        "Deduplication is enforced at the data layer, not just at the application entry point.",
      ],
      evidence: [{ id: "cron-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["DB mutation operations found", "no idempotency protection detected"] }],
    });
  }

  return findings;
}
