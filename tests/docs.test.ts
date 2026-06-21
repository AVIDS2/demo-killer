import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readDoc(file: string): Promise<string> {
  return fs.readFile(path.join(root, file), "utf8");
}

describe("product documentation", () => {
  it("uses Chinese as the primary README and links to English documentation", async () => {
    const readme = await readDoc("README.md");

    expect(readme).toContain("产品快照");
    expect(readme).toContain("assets/demokiller-banner.svg");
    expect(readme).toContain("img.shields.io/npm/v/demokiller");
    expect(readme).toContain("img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml");
    expect(readme).toContain("img.shields.io/github/stars/AVIDS2/demokiller");
    expect(readme).toContain("开源生产就绪闸门");
    expect(readme).toContain("当前以 npm CLI 和 agent guidance");
    expect(readme).toContain("当前入口");
    expect(readme).toContain("计划入口");
    expect(readme).toContain("你可以用它做什么");
    expect(readme).toContain("当前覆盖");
    expect(readme).toContain("如何理解结果");
    expect(readme).toContain("给 Agent 使用");
    expect(readme).toContain("杀死你的 demo");
    expect(readme).toContain("快速开始");
    expect(readme).toContain("npx demokiller init .");
    expect(readme).toContain("npx demokiller inspect . --markdown");
    expect(readme).toContain('<a href="README.en.md">English</a>');
  });

  it("ships an English README for global users", async () => {
    const readme = await readDoc("README.en.md");

    expect(readme).toContain("Product Snapshot");
    expect(readme).toContain("assets/demokiller-banner.svg");
    expect(readme).toContain("img.shields.io/npm/v/demokiller");
    expect(readme).toContain("img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml");
    expect(readme).toContain("open-source production-readiness gate");
    expect(readme).toContain("npm CLI and agent guidance");
    expect(readme).toContain("Current entry points");
    expect(readme).toContain("Planned entry points");
    expect(readme).toContain("What You Can Do With It");
    expect(readme).toContain("Current Coverage");
    expect(readme).toContain("How To Read Results");
    expect(readme).toContain("For Agents");
    expect(readme).toContain("Kill your demo");
    expect(readme).toContain("Quick Start");
    expect(readme).toContain("npx demokiller init .");
    expect(readme).toContain("npx demokiller inspect . --markdown");
    expect(readme).toContain('<a href="README.md">简体中文</a>');
  });
});
