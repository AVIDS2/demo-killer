import type { AnalysisReport, Finding, Verdict } from "../types.js";

export function buildJsonReport(
  findings: Finding[],
  generatedAt = new Date().toISOString(),
): AnalysisReport {
  const hasBlocker = findings.some((finding) => finding.severity === "blocker");
  const verdict: Verdict = hasBlocker
    ? "Launch Blocked"
    : findings.length > 0
      ? "Demo"
      : "Production Candidate";

  return {
    verdict,
    supportedScope: [
      "Next.js App Router",
      "TypeScript",
      "local static inspection",
      "AI/SaaS launch blockers",
    ],
    findings,
    generatedAt,
  };
}
