import type { BenchmarkSample } from "./benchmark.js";
import type { AnalysisReport } from "./types.js";

export type BenchmarkStatus = "match" | "mismatch" | "error";

export interface BenchmarkResult {
  sample: BenchmarkSample;
  status: BenchmarkStatus;
  expectedVerdict: BenchmarkSample["expectedVerdict"];
  actualVerdict?: AnalysisReport["verdict"];
  expectedRuleIds: string[];
  actualRuleIds: string[];
  error?: string;
}

export interface BenchmarkSuiteResult {
  results: BenchmarkResult[];
}

export interface BenchmarkRunnerDependencies {
  inspectRepository(sample: BenchmarkSample): Promise<AnalysisReport>;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameValues(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export async function runBenchmarkSuite(
  samples: BenchmarkSample[],
  dependencies: BenchmarkRunnerDependencies,
): Promise<BenchmarkSuiteResult> {
  const results: BenchmarkResult[] = [];

  for (const sample of samples) {
    const expectedRuleIds = uniqueSorted(sample.expectedRuleIds);

    try {
      const report = await dependencies.inspectRepository(sample);
      const actualRuleIds = uniqueSorted(report.findings.map((finding) => finding.ruleId));
      const status =
        report.verdict === sample.expectedVerdict && sameValues(actualRuleIds, expectedRuleIds)
          ? "match"
          : "mismatch";

      results.push({
        sample,
        status,
        expectedVerdict: sample.expectedVerdict,
        actualVerdict: report.verdict,
        expectedRuleIds,
        actualRuleIds,
      });
    } catch (error) {
      results.push({
        sample,
        status: "error",
        expectedVerdict: sample.expectedVerdict,
        expectedRuleIds,
        actualRuleIds: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { results };
}
