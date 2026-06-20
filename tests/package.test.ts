import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  license?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  files?: string[];
}

const root = process.cwd();

async function readPackageJson(): Promise<PackageJson> {
  const packageJson = await fs.readFile(path.join(root, "package.json"), "utf8");
  return JSON.parse(packageJson) as PackageJson;
}

describe("npm package contract", () => {
  it("defines publish metadata for the demokiller CLI", async () => {
    const pkg = await readPackageJson();

    expect(pkg.name).toBe("demokiller");
    expect(pkg.private).toBe(false);
    expect(pkg.bin).toEqual({
      demokiller: "dist/src/cli.js",
    });
    expect(pkg.scripts?.prepack).toBe("npm run build");
    expect(pkg.engines?.node).toBe(">=18");
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/AVIDS2/demokiller.git",
    });
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        "dist/src",
        "README.md",
        "benchmarks/github-projects.json",
        "LICENSE",
      ]),
    );
  });

  it("ships an MIT license file", async () => {
    const pkg = await readPackageJson();
    const license = await fs.readFile(path.join(root, "LICENSE"), "utf8");

    expect(pkg.license).toBe("MIT");
    expect(license).toContain("MIT License");
    expect(license).toContain("Demo Killer contributors");
  });

  it("keeps the CLI entrypoint executable after TypeScript build", async () => {
    const cliSource = await fs.readFile(path.join(root, "src", "cli.ts"), "utf8");
    const [firstLine] = cliSource.split(/\r?\n/);

    expect(firstLine).toBe("#!/usr/bin/env node");
  });
});
