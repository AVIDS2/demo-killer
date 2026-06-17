import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export interface ResolvedRepository {
  root: string;
  cleanup?: () => Promise<void>;
}

export function isGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.split("/").length >= 3;
  } catch {
    return false;
  }
}

function runGitClone(repoUrl: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", "--depth", "1", repoUrl, target], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `git clone failed with code ${code}`));
      }
    });
  });
}

export async function resolveRepository(input: string): Promise<ResolvedRepository> {
  if (!isGitHubUrl(input)) return { root: input };

  const parent = await mkdtemp(path.join(tmpdir(), "demokiller-"));
  const target = path.join(parent, "repo");
  await runGitClone(input, target);

  return {
    root: target,
    cleanup: async () => {
      const { rm } = await import("node:fs/promises");
      await rm(parent, { recursive: true, force: true });
    },
  };
}
