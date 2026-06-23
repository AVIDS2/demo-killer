import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeProject } from "../src/init.js";

const tempRoots: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "demokiller-init-"));
  tempRoots.push(root);
  return root;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("initializeProject", () => {
  it("creates an agent guide and root AGENTS.md production gate", async () => {
    const root = await makeProjectRoot();

    const result = await initializeProject(root);

    const agentGuidePath = path.join(root, ".demokiller", "AGENT.md");
    const agentsPath = path.join(root, "AGENTS.md");
    const agentGuide = await fs.readFile(agentGuidePath, "utf8");
    const agents = await fs.readFile(agentsPath, "utf8");

    expect(await fileExists(agentGuidePath)).toBe(true);
    expect(agentGuide).toContain("Kill your demo");
    expect(agentGuide).toContain("demokiller inspect . --markdown");
    expect(agentGuide).toContain("Launch Blocked");
    expect(agents).toContain("<!-- DEMOKILLER_START -->");
    expect(agents).toContain(".demokiller/AGENT.md");
    expect(result.files).toEqual(
      expect.arrayContaining([
        { path: ".demokiller/AGENT.md", status: "created" },
        { path: "AGENTS.md", status: "created" },
        { path: ".claude/skills/demokiller/SKILL.md", status: "created" },
      ]),
    );
  });

  it("appends one managed block to an existing AGENTS.md without duplicating it", async () => {
    const root = await makeProjectRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    await fs.writeFile(agentsPath, "# Existing Agent Rules\n\nKeep user instructions intact.\n");

    await initializeProject(root);
    await initializeProject(root);

    const agents = await fs.readFile(agentsPath, "utf8");
    const markerCount = agents.match(/<!-- DEMOKILLER_START -->/g)?.length ?? 0;

    expect(agents).toContain("# Existing Agent Rules");
    expect(agents).toContain("Keep user instructions intact.");
    expect(markerCount).toBe(1);
  });

  it("does not overwrite an existing custom .demokiller agent guide by default", async () => {
    const root = await makeProjectRoot();
    const demokillerDir = path.join(root, ".demokiller");
    const agentGuidePath = path.join(demokillerDir, "AGENT.md");
    await fs.mkdir(demokillerDir);
    await fs.writeFile(agentGuidePath, "custom local guide\n");

    const result = await initializeProject(root);

    await expect(fs.readFile(agentGuidePath, "utf8")).resolves.toBe("custom local guide\n");
    expect(result.files).toEqual(
      expect.arrayContaining([{ path: ".demokiller/AGENT.md", status: "unchanged" }]),
    );
  });

  it("creates a Claude Code skill file with correct frontmatter", async () => {
    const root = await makeProjectRoot();

    const result = await initializeProject(root);

    const skillPath = path.join(root, ".claude", "skills", "demokiller", "SKILL.md");
    expect(await fileExists(skillPath)).toBe(true);

    const content = await fs.readFile(skillPath, "utf8");
    expect(content).toContain("name: demokiller");
    expect(content).toContain("description:");
    expect(content).toContain("when_to_use:");
    expect(content).toContain("allowed-tools:");
    expect(content).toContain("Bash(npx demokiller *)");
    expect(content).toContain("npx demokiller inspect . --markdown");
    expect(content).toContain("Launch Blocked");

    expect(result.files).toEqual(
      expect.arrayContaining([{ path: ".claude/skills/demokiller/SKILL.md", status: "created" }]),
    );
  });

  it("does not overwrite an existing skill file", async () => {
    const root = await makeProjectRoot();
    const skillDir = path.join(root, ".claude", "skills", "demokiller");
    const skillPath = path.join(skillDir, "SKILL.md");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillPath, "custom skill content\n");

    const result = await initializeProject(root);

    await expect(fs.readFile(skillPath, "utf8")).resolves.toBe("custom skill content\n");
    expect(result.files).toEqual(
      expect.arrayContaining([{ path: ".claude/skills/demokiller/SKILL.md", status: "unchanged" }]),
    );
  });

  it("returns unchanged for all files on second init", async () => {
    const root = await makeProjectRoot();

    await initializeProject(root);
    const result = await initializeProject(root);

    expect(result.files).toEqual(
      expect.arrayContaining([
        { path: ".demokiller/AGENT.md", status: "unchanged" },
        { path: "AGENTS.md", status: "unchanged" },
        { path: ".claude/skills/demokiller/SKILL.md", status: "unchanged" },
      ]),
    );
  });
});
