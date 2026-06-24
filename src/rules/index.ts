import { buildInventory, type ProjectInventory } from "../inventory.js";
import { inspectRouteSource } from "../source-inspector.js";
import type { Finding } from "../types.js";
// Agent rules
import { agentCodeExecRule } from "./agent-code-exec.js";
import { agentToolLimitRule } from "./agent-tool-limit.js";
import { contextLeakRule } from "./context-leak.js";
import { mcpServerAuthRule } from "./mcp-server-auth.js";
import { promptInjectionRule } from "./prompt-injection.js";
// Security rules
import { adminMutationAuthRule } from "./admin-mutation-auth.js";
import { commandInjectionRule } from "./command-injection.js";
import { corsWildcardRule } from "./cors-wildcard.js";
import { cspMissingRule } from "./csp-missing.js";
import { hardcodedSecretRule } from "./hardcoded-secret.js";
import { httpsEnforcementRule } from "./https-enforcement.js";
import { insecureDeserializationRule } from "./insecure-deserialization.js";
import { pathTraversalRule } from "./path-traversal.js";
import { publicAiRouteRule } from "./public-ai-route.js";
import { sensitiveDataRule } from "./sensitive-data.js";
import { sqlInjectionRule } from "./sql-injection.js";
import { ssrfRule } from "./ssrf.js";
import { webhookSafetyRule } from "./webhook-safety.js";
// Quality rules
import { debugLeakRule } from "./debug-leak.js";
import { errorLeakRule } from "./error-leak.js";
import { inputValidationRule } from "./input-validation.js";
import { logInjectionRule } from "./log-injection.js";
import { observabilityRule } from "./observability.js";
// Project rules
import { depsVulnerabilityFindings } from "./deps-vulnerability.js";
import { dockerSecurityFindings } from "./docker-security.js";
import { envContractRule } from "./env-contract.js";
import { migrationPostureRule } from "./migration-posture.js";
import { missingDocsRule } from "./missing-docs.js";
import { missingTestsRule } from "./missing-tests.js";
import { npmPublishRule } from "./npm-publish.js";
import { tsStrictRule } from "./ts-strict.js";

async function readDeclaredEnvVars(root: string, envExamplePath?: string): Promise<string[]> {
  if (!envExamplePath) return [];
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const text = await fs.readFile(path.join(root, envExamplePath), "utf8");
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#")).map((l) => l.split("=", 1)[0]).filter((n) => n.length > 0);
}

export interface AnalysisResult {
  findings: Finding[];
  inventory: ProjectInventory;
}

export async function analyzeFindings(root: string): Promise<AnalysisResult> {
  const inventory = await buildInventory(root);
  const routeEvidence = await Promise.all(inventory.apiRoutes.map((r) => inspectRouteSource(root, r)));
  const usedEnvVars = Array.from(new Set(routeEvidence.flatMap((r) => r.envVars)));
  const declaredEnvVars = await readDeclaredEnvVars(root, inventory.envExamplePath);

  const findings = [
    // Original rules
    ...routeEvidence.flatMap(publicAiRouteRule),
    ...routeEvidence.flatMap(adminMutationAuthRule),
    ...routeEvidence.flatMap(webhookSafetyRule),
    ...routeEvidence.flatMap(observabilityRule),
    ...routeEvidence.flatMap(corsWildcardRule),
    ...routeEvidence.flatMap(debugLeakRule),
    // Security rules
    ...routeEvidence.flatMap(ssrfRule),
    ...routeEvidence.flatMap(commandInjectionRule),
    ...routeEvidence.flatMap(hardcodedSecretRule),
    ...routeEvidence.flatMap(sqlInjectionRule),
    ...routeEvidence.flatMap(pathTraversalRule),
    ...routeEvidence.flatMap(insecureDeserializationRule),
    // Quality rules
    ...routeEvidence.flatMap(inputValidationRule),
    ...routeEvidence.flatMap(errorLeakRule),
    ...routeEvidence.flatMap(logInjectionRule),
    ...routeEvidence.flatMap(sensitiveDataRule),
    ...routeEvidence.flatMap(cspMissingRule),
    ...routeEvidence.flatMap(httpsEnforcementRule),
    // Agent rules
    ...routeEvidence.flatMap(agentCodeExecRule),
    ...routeEvidence.flatMap(mcpServerAuthRule),
    ...routeEvidence.flatMap(agentToolLimitRule),
    ...routeEvidence.flatMap(promptInjectionRule),
    ...routeEvidence.flatMap(contextLeakRule),
    // Project rules
    ...envContractRule(inventory, usedEnvVars, declaredEnvVars),
    ...migrationPostureRule(inventory),
    ...(await depsVulnerabilityFindings(inventory)),
    ...(await dockerSecurityFindings(inventory)),
    ...missingTestsRule(inventory),
    ...tsStrictRule(inventory),
    ...missingDocsRule(inventory),
    ...npmPublishRule(inventory),
  ];

  return { findings, inventory };
}
