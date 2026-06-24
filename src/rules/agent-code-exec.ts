import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function agentCodeExecRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("evaluatesLlmOutput")) return [];

  return [{
    ruleId: "DK-AGENT-001",
    title: "LLM output is passed to code execution without sandboxing",
    severity: "blocker",
    confidence: "high",
    entryPoint: route.path,
    capability: "Executes LLM-generated code directly",
    asset: "host system integrity",
    missingControls: ["sandboxedExecution"],
    consequence: "An attacker can craft prompts that cause the LLM to generate malicious code, which is then executed on the server with full privileges.",
    acceptanceCriteria: [
      "LLM output is never passed to eval/exec/Function constructors.",
      "If code execution is required, use a sandboxed environment (Docker, VM, WASM).",
      "LLM output is treated as untrusted user input.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "evaluatesLlmOutput", asset: "host system integrity", controls: route.controls, signals: route.capabilities }],
  }];
}
