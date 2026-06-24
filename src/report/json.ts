import type { AnalysisReport, Finding, HardeningPlan, Verdict } from "../types.js";

export interface ReportOptions {
  hasSupportedProjectEvidence?: boolean;
}

function uniqueRuleIds(findings: Finding[]): string[] {
  return [...new Set(findings.map((finding) => finding.ruleId))];
}

export function buildHardeningPlan(findings: Finding[]): HardeningPlan {
  const blockers = uniqueRuleIds(findings.filter((finding) => finding.severity === "blocker"));
  const baseline = uniqueRuleIds(findings.filter((finding) => finding.severity === "high"));
  const operational = uniqueRuleIds(
    findings.filter((finding) => finding.severity === "medium" || finding.severity === "advisory"),
  );

  return {
    summary:
      "Kill the demo by removing launch blockers first, then establish a production baseline, then improve operational confidence.",
    phases: [
      {
        id: "phase-0",
        title: "Stop Launch",
        intent: "Fix these before real users or production traffic touch the system.",
        findingRuleIds: blockers,
      },
      {
        id: "phase-1",
        title: "Production Baseline",
        intent: "Add the minimum controls needed for reproducible, diagnosable production operation.",
        findingRuleIds: baseline,
      },
      {
        id: "phase-2",
        title: "Operational Confidence",
        intent: "Reduce residual operational risk after launch blockers and baseline gaps are closed.",
        findingRuleIds: operational,
      },
    ],
    recheckCommand: "demokiller inspect . --markdown",
  };
}

export function buildJsonReport(
  findings: Finding[],
  generatedAt = new Date().toISOString(),
  options: ReportOptions = { hasSupportedProjectEvidence: true },
): AnalysisReport {
  const hasBlocker = findings.some((finding) => finding.severity === "blocker");
  const verdict: Verdict = hasBlocker
    ? "Launch Blocked"
    : findings.length > 0
      ? "Demo"
      : options.hasSupportedProjectEvidence
        ? "Production Candidate"
        : "Insufficient Evidence";

  return {
    verdict,
    supportedScope: [
      "Next.js App Router", "Express", "Fastify",
      "FastAPI", "Flask", "Django",
      "Gin", "Echo", "Fiber",
      "Actix", "Axum", "Rocket",
      "Spring Boot", "Ktor",
      "Laravel", "Rails", "Sinatra",
      "ASP.NET", "Vapor",
      "http4s", "Akka",
      "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java",
      "Kotlin", "Scala", "C#", "PHP", "Ruby", "Swift",
      "C", "C++", "Lua", "Shell", "Dart", "Zig",
      "local static inspection", "AI/SaaS launch blockers",
    ],
    findings,
    hardeningPlan: buildHardeningPlan(findings),
    generatedAt,
  };
}
