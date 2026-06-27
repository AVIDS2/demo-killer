import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readDoc(file: string): Promise<string> {
  return fs.readFile(path.join(root, file), "utf8");
}

describe("product documentation", () => {
  it("ships an English README as the primary documentation", async () => {
    const readme = await readDoc("README.md");

    expect(readme).toContain("assets/demokiller-banner.svg");
    expect(readme).toContain("img.shields.io/npm/v/demokiller");
    expect(readme).toContain("img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml");
    expect(readme).toContain("img.shields.io/github/stars/AVIDS2/demokiller");
    expect(readme).toContain("Demo Killer");
    expect(readme).toContain("production gate");
    expect(readme).toContain("Quick Start");
    expect(readme).toContain("demokiller init .");
    expect(readme).toContain("demokiller inspect");
    expect(readme).toContain("Project types");
    expect(readme).toContain("For Agents");
    expect(readme).toContain('<a href="README.zh-CN.md">简体中文</a>');
  });

  it("references a Chinese README for local users", async () => {
    const readme = await readDoc("README.md");
    expect(readme).toContain("README.zh-CN.md");
  });
});
