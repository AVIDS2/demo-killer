import type { AnalysisReport, Finding } from "../types.js";

function renderFinding(finding: Finding): string {
  const evidenceLines = finding.evidence.map((evidence) => {
    const suffix = evidence.location.line ? `:${evidence.location.line}` : "";
    return `- Evidence: ${evidence.location.path}${suffix} via ${evidence.detector}`;
  });

  return [
    `### ${finding.ruleId}: ${finding.title}`,
    "",
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    finding.entryPoint ? `Entry point: ${finding.entryPoint}` : undefined,
    finding.capability ? `Capability: ${finding.capability}` : undefined,
    finding.asset ? `Asset: ${finding.asset}` : undefined,
    `Missing controls: ${finding.missingControls.join(", ")}`,
    "",
    `Production consequence: ${finding.consequence}`,
    "",
    "Acceptance criteria:",
    ...finding.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    ...evidenceLines,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function renderMarkdownReport(report: AnalysisReport): string {
  return [
    "# Demo Killer Report",
    "",
    `Verdict: ${report.verdict}`,
    "",
    "Supported scope:",
    ...report.supportedScope.map((item) => `- ${item}`),
    "",
    "## Findings",
    "",
    report.findings.length === 0
      ? "No launch blockers found in the supported scope."
      : report.findings.map(renderFinding).join("\n\n"),
  ].join("\n");
}
