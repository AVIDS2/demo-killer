import { buildInventory, type ProjectInventory } from "../inventory.js";
import { inspectRouteSource } from "../source-inspector.js";
import type { Finding } from "../types.js";
import { adminMutationAuthRule } from "./admin-mutation-auth.js";
import { commandInjectionRule } from "./command-injection.js";
import { corsWildcardRule } from "./cors-wildcard.js";
import { debugLeakRule } from "./debug-leak.js";
import { envContractRule } from "./env-contract.js";
import { errorLeakRule } from "./error-leak.js";
import { hardcodedSecretRule } from "./hardcoded-secret.js";
import { inputValidationRule } from "./input-validation.js";
import { logInjectionRule } from "./log-injection.js";
import { migrationPostureRule } from "./migration-posture.js";
import { observabilityRule } from "./observability.js";
import { publicAiRouteRule } from "./public-ai-route.js";
import { sensitiveDataRule } from "./sensitive-data.js";
import { ssrfRule } from "./ssrf.js";
import { webhookSafetyRule } from "./webhook-safety.js";

async function readDeclaredEnvVars(root: string, envExamplePath?: string): Promise<string[]> {
  if (!envExamplePath) return [];

  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const text = await fs.readFile(path.join(root, envExamplePath), "utf8");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0])
    .filter((name) => name.length > 0);
}

export interface AnalysisResult {
  findings: Finding[];
  inventory: ProjectInventory;
}

export async function analyzeFindings(root: string): Promise<AnalysisResult> {
  const inventory = await buildInventory(root);
  const routeEvidence = await Promise.all(
    inventory.apiRoutes.map((route) => inspectRouteSource(root, route)),
  );
  const usedEnvVars = Array.from(new Set(routeEvidence.flatMap((route) => route.envVars)));
  const declaredEnvVars = await readDeclaredEnvVars(root, inventory.envExamplePath);

  const findings = [
    ...routeEvidence.flatMap(publicAiRouteRule),
    ...routeEvidence.flatMap(adminMutationAuthRule),
    ...routeEvidence.flatMap(webhookSafetyRule),
    ...routeEvidence.flatMap(observabilityRule),
    ...routeEvidence.flatMap(corsWildcardRule),
    ...routeEvidence.flatMap(debugLeakRule),
    ...routeEvidence.flatMap(ssrfRule),
    ...routeEvidence.flatMap(commandInjectionRule),
    ...routeEvidence.flatMap(hardcodedSecretRule),
    ...routeEvidence.flatMap(inputValidationRule),
    ...routeEvidence.flatMap(errorLeakRule),
    ...routeEvidence.flatMap(logInjectionRule),
    ...routeEvidence.flatMap(sensitiveDataRule),
    ...envContractRule(inventory, usedEnvVars, declaredEnvVars),
    ...migrationPostureRule(inventory),
  ];

  return { findings, inventory };
}
