import type { Finding } from "../types.js";
import type { AuthGap } from "../taint-analysis.js";

export function authChainFindings(authGaps: AuthGap[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const gap of authGaps) {
    // Skip internal library functions
    if (gap.route === "PrismaClient" || gap.route === "OpenAI" || gap.route === "Stripe") continue;
    if (gap.route === "NextResponse" || gap.route === "Response") continue;

    const key = `${gap.file}:${gap.route}`;
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      ruleId: "DK-AUTHCHAIN-001",
      title: `Handler "${gap.route}" has no authentication in its call chain`,
      severity: "blocker",
      confidence: "high",
      entryPoint: gap.file,
      capability: "Route handler reachable without authentication",
      asset: "protected resources",
      missingControls: ["authMiddleware"],
      consequence: `The handler "${gap.route}" can be invoked without any authentication check in its call chain. This is verified by cross-file analysis, not just keyword matching.`,
      acceptanceCriteria: [
        "Authentication middleware is applied before this handler.",
        "The auth check is in the call chain, not just imported.",
        "All sensitive routes have verified auth coverage.",
      ],
      evidence: [{
        id: "auth-chain",
        detector: "call-graph-analysis",
        location: { path: gap.file, line: gap.line },
        entryPoint: gap.file,
        capability: "no-auth-in-chain",
        asset: "protected resources",
        controls: [],
        signals: [gap.reason],
      }],
    });
  }

  return findings;
}
