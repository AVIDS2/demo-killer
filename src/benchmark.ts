import { promises as fs } from "node:fs";
import type { Verdict } from "./types.js";

export type BenchmarkArchetype =
  | "ai-saas"
  | "payment-starter"
  | "api-backend"
  | "admin-panel"
  | "content-site"
  | "automation-worker"
  | "agent-app";

export interface BenchmarkSample {
  name: string;
  archetype: BenchmarkArchetype;
  repo: string;
  why: string;
  riskProfile: string[];
  expectedVerdict: Verdict;
  expectedRuleIds: string[];
}

export async function loadBenchmarkManifest(filePath: string): Promise<BenchmarkSample[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const samples = JSON.parse(raw) as BenchmarkSample[];

  return samples.map((sample) => ({
    name: sample.name.trim(),
    archetype: sample.archetype,
    repo: sample.repo.trim(),
    why: sample.why.trim(),
    riskProfile: [...new Set(sample.riskProfile)].sort(),
    expectedVerdict: sample.expectedVerdict,
    expectedRuleIds: [...new Set(sample.expectedRuleIds)].sort(),
  }));
}
