import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function commandInjectionRule(route: RouteSourceEvidence): Finding[] {
  if (!route.controls.includes("commandExecution")) return [];

  return [
    {
      ruleId: "DK-CMDI-001",
      title: "Route executes system commands and may be vulnerable to command injection",
      severity: "blocker",
      confidence: "medium",
      entryPoint: route.path,
      capability: "Executes OS-level commands from route handler",
      asset: "host system integrity",
      missingControls: ["commandSanitization"],
      consequence:
        "User-controlled input reaching exec/spawn/subprocess can allow arbitrary command execution on the server.",
      acceptanceCriteria: [
        "Command arguments are not constructed from user input.",
        "If command execution is required, use an allowlist of permitted commands.",
        "User input is passed as arguments (not interpolated into command strings).",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "commandExecution",
          asset: "host system integrity",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
