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
    expect(readme).toContain("Kill your demo");
    expect(readme).toContain("Quick Start");
    expect(readme).toContain("npx demokiller init .");
    expect(readme).toContain("npx demokiller inspect . --markdown");
    expect(readme).toContain('<a href="README.md">简体中文</a>');
  });
});
