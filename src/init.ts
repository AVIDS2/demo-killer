import fs from "node:fs/promises";
import path from "node:path";

export type InitFileStatus = "created" | "updated" | "unchanged";

export interface InitFileResult {
  path: string;
  status: InitFileStatus;
}

export interface InitResult {
  root: string;
  files: InitFileResult[];
}

const managedBlockStart = "<!-- DEMOKILLER_START -->";
const managedBlockEnd = "<!-- DEMOKILLER_END -->";

const agentGuide = `# Demo Killer Agent Guide

Core theme: Kill your demo and turn it into a truly production-deliverable system.

Before a launch, release, deployment, or production handoff, run:

\`\`\`powershell
demokiller inspect . --markdown
\`\`\`

Treat \`Launch Blocked\` as a stop signal. Do not hide it behind generic refactors or cosmetic fixes.

When Demo Killer reports findings:

1. Read the evidence path and production consequence first.
2. Fix Phase 0 launch blockers before polishing non-blocking issues.
3. Re-run \`demokiller inspect . --markdown\` after every hardening pass.
4. Do not claim production readiness. Use \`Production Candidate\` only within Demo Killer's supported scope.

Demo Killer is not a replacement for human review, security review, runtime testing, or deployment verification. It is the production gate that catches demo-shaped gaps before real users touch the system.
`;

const agentsBlock = `${managedBlockStart}
## Demo Killer Production Gate

Read \`.demokiller/AGENT.md\` before production-facing work.

Before launch, deployment, release, or handoff, run:

\`\`\`powershell
demokiller inspect . --markdown
\`\`\`

If the verdict is \`Launch Blocked\`, treat the work as not ready for real users until the blocking findings are fixed and rechecked.
${managedBlockEnd}`;

const skillContent = `---
name: demokiller
description: >
  Production readiness gate for AI-generated projects.
  Use before any launch, deployment, release, or production handoff
  to catch blockers that demo-level code leaves behind.
when_to_use: >
  Use this skill when the user asks to check production readiness,
  run a pre-launch audit, verify deployment safety, or when about
  to ship code. Also use when the user mentions "launch blocked",
  "go live", "deploy to production", or "production gate".
allowed-tools: Bash(npx demokiller *) Bash(npx demokiller-mcp *)
---

# Demo Killer — Production Gate

Run a production-readiness inspection on the current project and act on the results.

## Current report

\`\`\`!
npx demokiller inspect . --markdown
\`\`\`

## How to use this report

1. Read the **Verdict** line first.
2. If the verdict is \`Launch Blocked\`, read every Phase 0 finding — these are launch blockers that must be fixed before any production traffic.
3. For each blocker, read the **entry point**, **production consequence**, and **acceptance criteria**. Fix the code to meet every acceptance criterion.
4. After fixing all Phase 0 blockers, re-run this skill to verify. Do not proceed to Phase 1 or Phase 2 until Phase 0 is clear.
5. Phase 1 findings are production baseline gaps (logging, env contracts, migrations). Fix these after blockers are resolved.
6. Phase 2 findings are operational confidence improvements. Fix these last.
7. Never claim \`Production Ready\`. The best outcome is \`Production Candidate\`, which still requires human review, security review, runtime testing, and deployment verification.

## Rules

- Do not skip, suppress, or downgrade any finding.
- Do not hide launch blockers behind UI polish or refactoring tasks.
- Do not add features beyond what the findings require.
- Re-run the inspection after every hardening pass until no blockers remain.
`;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

async function ensureAgentGuide(root: string): Promise<InitFileResult> {
  const relativePath = ".demokiller/AGENT.md";
  const fullPath = path.join(root, ".demokiller", "AGENT.md");
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  if (await pathExists(fullPath)) {
    return { path: normalizeRelativePath(relativePath), status: "unchanged" };
  }

  await fs.writeFile(fullPath, agentGuide, "utf8");
  return { path: normalizeRelativePath(relativePath), status: "created" };
}

function upsertManagedBlock(existing: string): { content: string; status: InitFileStatus } {
  if (!existing.trim()) {
    return { content: `${agentsBlock}\n`, status: "created" };
  }

  const startIndex = existing.indexOf(managedBlockStart);
  const endIndex = existing.indexOf(managedBlockEnd);
  if (startIndex >= 0 && endIndex > startIndex) {
    const endWithMarker = endIndex + managedBlockEnd.length;
    const content = `${existing.slice(0, startIndex)}${agentsBlock}${existing.slice(endWithMarker)}`;
    return { content, status: content === existing ? "unchanged" : "updated" };
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return { content: `${existing}${separator}${agentsBlock}\n`, status: "updated" };
}

async function ensureAgentsHook(root: string): Promise<InitFileResult> {
  const relativePath = "AGENTS.md";
  const fullPath = path.join(root, relativePath);
  const exists = await pathExists(fullPath);
  const existing = exists ? await fs.readFile(fullPath, "utf8") : "";
  const { content, status } = upsertManagedBlock(existing);

  if (status !== "unchanged") {
    await fs.writeFile(fullPath, content, "utf8");
  }

  return { path: relativePath, status: exists ? status : "created" };
}

async function ensureClaudeSkill(root: string): Promise<InitFileResult> {
  const relativePath = ".claude/skills/demokiller/SKILL.md";
  const fullPath = path.join(root, ".claude", "skills", "demokiller", "SKILL.md");
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  if (await pathExists(fullPath)) {
    return { path: normalizeRelativePath(relativePath), status: "unchanged" };
  }

  await fs.writeFile(fullPath, skillContent, "utf8");
  return { path: normalizeRelativePath(relativePath), status: "created" };
}

export async function initializeProject(root: string = process.cwd()): Promise<InitResult> {
  const resolvedRoot = path.resolve(root);
  await fs.mkdir(resolvedRoot, { recursive: true });

  return {
    root: resolvedRoot,
    files: [
      await ensureAgentGuide(resolvedRoot),
      await ensureAgentsHook(resolvedRoot),
      await ensureClaudeSkill(resolvedRoot),
    ],
  };
}
