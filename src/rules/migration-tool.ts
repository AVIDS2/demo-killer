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

export async function migrationToolFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "migration-tool") return [];
  const files = await walkSourceFiles(root, [".ts",".tsx",".js",".jsx",".py",".sql"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // RULE IMPLEMENTATIONS:
  // DK-MIG-001 (high,medium): Non-idempotent migration - check CREATE TABLE/ALTER TABLE/INSERT INTO without IF NOT EXISTS/IF EXISTS/upsert
  // DK-MIG-002 (high,medium): Destructive without backup - check DROP/DELETE/TRUNCATE without backup/snapshot/pg_dump
  // DK-MIG-003 (medium,medium): No rollback - check exports.up/async up without exports.down/async down/rollback

  for (const file of files) {
    const content = await readFileContent(root, file);

    // DK-MIG-001: Non-idempotent migration
    {
      const nonIdempotentPatterns = [
        { pattern: /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, signal: "CREATE TABLE without IF NOT EXISTS" },
        { pattern: /\.createTable\s*\(\s*['"][^'"]+['"]\s*,/i, signal: "knex .createTable() without idempotent guard" },
        { pattern: /ALTER\s+TABLE\s+\S+\s+ADD\s+(?!IF\s+NOT\s+EXISTS)/i, signal: "ALTER TABLE ADD without IF NOT EXISTS" },
        { pattern: /\.alterTable\s*\(\s*['"][^'"]+['"]\s*,/i, signal: "knex .alterTable() without idempotent guard" },
        { pattern: /INSERT\s+INTO\s+(?!.*ON\s+CONFLICT|.*ON\s+DUPLICATE|.*UPSERT)/i, signal: "INSERT INTO without upsert/on-conflict" },
        { pattern: /\.raw\s*\(\s*['"`]INSERT\s+INTO/i, signal: "Raw INSERT without upsert guard" },
      ];
      for (const { pattern, signal } of nonIdempotentPatterns) {
        if (pattern.test(content)) {
          findings.push({
            ruleId: "DK-MIG-001",
            title: "Non-idempotent migration operation",
            severity: "high",
            confidence: "medium",
            missingControls: [
              "Use IF NOT EXISTS / IF EXISTS guards on DDL statements",
              "Use ON CONFLICT / ON DUPLICATE KEY for upsert semantics",
              "Ensure migration can be re-run safely without error",
            ],
            consequence: "Re-running the migration after a partial failure will error, leaving the database in an inconsistent state that is hard to recover from.",
            acceptanceCriteria: [
              "All CREATE TABLE statements include IF NOT EXISTS",
              "All ALTER TABLE statements include IF EXISTS guards",
              "All INSERT statements use upsert or ON CONFLICT patterns",
              "Migration can be executed multiple times with identical final state",
            ],
            evidence: [{
              id: `MIG-001-${file}`,
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: [signal],
            }],
          });
        }
      }
    }

    // DK-MIG-002: Destructive without backup
    {
      const destructivePatterns = [
        { pattern: /\bDROP\s+TABLE\b/i, signal: "DROP TABLE statement" },
        { pattern: /\bDROP\s+DATABASE\b/i, signal: "DROP DATABASE statement" },
        { pattern: /\bDELETE\s+FROM\b/i, signal: "DELETE FROM statement" },
        { pattern: /\bTRUNCATE\b/i, signal: "TRUNCATE statement" },
      ];
      const hasDestructive = destructivePatterns.some(({ pattern }) => pattern.test(content));
      const hasBackup = /backup|snapshot|pg_dump|mysqldump|mongodump/i.test(allContent);
      if (hasDestructive && !hasBackup) {
        findings.push({
          ruleId: "DK-MIG-002",
          title: "Destructive migration without backup strategy",
          severity: "high",
          confidence: "medium",
          missingControls: [
            "Create a backup/snapshot before running destructive migrations",
            "Use pg_dump, mysqldump, or equivalent before DROP/DELETE/TRUNCATE",
            "Document backup and restore procedures for destructive changes",
          ],
          consequence: "Data loss is unrecoverable if the destructive migration runs without a prior backup. Production data may be permanently destroyed.",
          acceptanceCriteria: [
            "Every migration containing DROP, DELETE, or TRUNCATE has a corresponding backup step",
            "Backup command is documented or automated before destructive migration execution",
            "Restore procedure is tested and documented",
          ],
          evidence: [{
            id: `MIG-002-${file}`,
            detector: "pattern-match",
            location: { path: file },
            controls: [],
            signals: destructivePatterns.filter(({ pattern }) => pattern.test(content)).map(({ signal }) => signal),
          }],
        });
      }
    }

    // DK-MIG-003: No rollback
    {
      const hasUp = /\bexports\.up\b|^async\s+up\s*\(/im.test(content);
      const hasDown = /\bexports\.down\b|^async\s+down\s*\(/im.test(content);
      if (hasUp && !hasDown) {
        findings.push({
          ruleId: "DK-MIG-003",
          title: "Migration without rollback/down function",
          severity: "medium",
          confidence: "medium",
          missingControls: [
            "Implement exports.down or async down() to reverse the migration",
            "Ensure every DDL change in up() has a corresponding reversal in down()",
            "Test rollback path before deploying to production",
          ],
          consequence: "If the migration introduces a defect or needs to be reverted, there is no automated way to roll back. Manual database intervention increases risk of further errors.",
          acceptanceCriteria: [
            "Every migration file exports a down/rollback function",
            "The down function reverses all changes made by the up function",
            "Rollback path is tested in a staging environment before production deployment",
          ],
          evidence: [{
            id: `MIG-003-${file}`,
            detector: "pattern-match",
            location: { path: file },
            controls: [],
            signals: ["exports.up or async up() found without matching exports.down or async down()"],
          }],
        });
      }
    }
  }

  return findings;
}
