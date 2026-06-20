export type Verdict =
  | "Demo"
  | "Launch Blocked"
  | "Production Candidate"
  | "Insufficient Evidence";

export type Severity = "blocker" | "high" | "medium" | "advisory";

export type Confidence = "high" | "medium" | "low";

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface Evidence {
  id: string;
  detector: string;
  location: SourceLocation;
  entryPoint?: string;
  capability?: string;
  asset?: string;
  controls: string[];
  signals: string[];
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  evidence: Evidence[];
  entryPoint?: string;
  capability?: string;
  asset?: string;
  missingControls: string[];
  consequence: string;
  acceptanceCriteria: string[];
}

export interface HardeningPhase {
  id: "phase-0" | "phase-1" | "phase-2";
  title: string;
  intent: string;
  findingRuleIds: string[];
}

export interface HardeningPlan {
  summary: string;
  phases: HardeningPhase[];
  recheckCommand: string;
}

export interface AnalysisReport {
  verdict: Verdict;
  supportedScope: string[];
  findings: Finding[];
  hardeningPlan: HardeningPlan;
  generatedAt: string;
}
