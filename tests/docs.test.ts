import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readDoc(file: string): Promise<string> {
  return fs.readFile(path.join(root, file), "utf8");
}

describe("product documentation", () => {
  it("ships a Chinese README as the primary documentation", async () => {
    const readme = await readDoc("README.md");

    expect(readme).toContain("assets/demokiller-banner.svg");
    expect(readme).toContain("img.shields.io/npm/v/demokiller");
    expect(readme).toContain("img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml");
    expect(readme).toContain("img.shields.io/github/stars/AVIDS2/demokiller");
    expect(readme).toContain("Demo Killer");
    expect(readme).toContain("生产就绪");
    expect(readme).toContain("快速开始");
    expect(readme).toContain("demokiller init .");
    expect(readme).toContain("demokiller inspect");
    expect(readme).toContain("支持的项目类型");
    expect(readme).toContain("给 Agent 使用");
    expect(readme).toContain('<a href="README.en.md">English</a>');
  });

  it("references an English README for international users", async () => {
    const readme = await readDoc("README.md");
    expect(readme).toContain("README.en.md");
  });
});
