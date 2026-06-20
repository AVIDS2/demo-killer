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

export async function initializeProject(root: string = process.cwd()): Promise<InitResult> {
  const resolvedRoot = path.resolve(root);
  await fs.mkdir(resolvedRoot, { recursive: true });

  return {
    root: resolvedRoot,
    files: [await ensureAgentGuide(resolvedRoot), await ensureAgentsHook(resolvedRoot)],
  };
}
