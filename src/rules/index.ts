import { buildInventory, type ProjectInventory } from "../inventory.js";
import { inspectRouteSource } from "../source-inspector.js";
import { buildCallGraph } from "../call-graph.js";
import { analyzeTaint, findAuthGaps } from "../taint-analysis.js";
import type { Finding } from "../types.js";
// Agent rules
import { agentCodeExecRule } from "./agent-code-exec.js";
import { agentToolLimitRule } from "./agent-tool-limit.js";
import { authChainFindings } from "./auth-chain.js";
import { concurrencyRule, featureFlagRule, paymentIdempotencyRule, transactionSafetyRule } from "./business-logic.js";
import { contextLeakRule } from "./context-leak.js";
import { mcpServerAuthRule } from "./mcp-server-auth.js";
import { promptInjectionRule } from "./prompt-injection.js";
// Security rules
import { adminMutationAuthRule } from "./admin-mutation-auth.js";
import { commandInjectionRule } from "./command-injection.js";
import { connectionPoolingRule } from "./connection-pooling.js";
import { corsWildcardRule } from "./cors-wildcard.js";
import { cspMissingRule } from "./csp-missing.js";
import { hardcodedSecretRule } from "./hardcoded-secret.js";
import { httpsEnforcementRule } from "./https-enforcement.js";
import { insecureDeserializationRule } from "./insecure-deserialization.js";
import { pathTraversalRule } from "./path-traversal.js";
import { publicAiRouteRule } from "./public-ai-route.js";
import { requestTimeoutRule } from "./request-timeout.js";
import { sensitiveDataRule } from "./sensitive-data.js";
import { sqlInjectionRule } from "./sql-injection.js";
import { ssrfRule } from "./ssrf.js";
import { taintPathFindings } from "./taint-path.js";
import { webhookSafetyRule } from "./webhook-safety.js";
// Quality rules
import { debugLeakRule } from "./debug-leak.js";
import { errorLeakRule } from "./error-leak.js";
import { gracefulShutdownRule } from "./graceful-shutdown.js";
import { healthCheckRule } from "./health-check.js";
import { inputValidationRule } from "./input-validation.js";
import { logInjectionRule } from "./log-injection.js";
import { nPlusOneRule } from "./n-plus-one.js";
import { observabilityRule } from "./observability.js";
import { piiExposureRule } from "./pii-exposure.js";
// Project rules
import { cliToolFindings } from "./cli-tool.js";
import { depsVulnerabilityFindings } from "./deps-vulnerability.js";
import { dockerSecurityFindings } from "./docker-security.js";
import { envContractRule } from "./env-contract.js";
import { librarySdkFindings } from "./library-sdk.js";
import { migrationPostureRule } from "./migration-posture.js";
import { missingDocsRule } from "./missing-docs.js";
import { missingTestsRule } from "./missing-tests.js";
import { mqWorkerFindings } from "./mq-worker.js";
import { npmPublishRule } from "./npm-publish.js";
import { iacFindings } from "./iac.js";
import { paymentSystemFindings, authServiceFindings } from "./payment-auth.js";
import { tsStrictRule } from "./ts-strict.js";
import { projectTypeFindings } from "./universal-project.js";

async function readDeclaredEnvVars(root: string, envExamplePath?: string): Promise<string[]> {
  if (!envExamplePath) return [];
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const text = await fs.readFile(path.join(root, envExamplePath), "utf8");
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#")).map((l) => l.replace(/^export\s+/, "").split("=", 1)[0]).filter((n) => n.length > 0);
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

  // Phase 1: Call graph analysis
  const callGraph = await buildCallGraph(root);
  const taintPaths = analyzeTaint(callGraph);
  const authGaps = findAuthGaps(callGraph, inventory.apiRoutes);

  const findings = [
    // Pattern-based rules (original)
    ...routeEvidence.flatMap(publicAiRouteRule),
    ...routeEvidence.flatMap(adminMutationAuthRule),
    ...routeEvidence.flatMap(webhookSafetyRule),
    ...routeEvidence.flatMap(observabilityRule),
    ...routeEvidence.flatMap(corsWildcardRule),
    ...routeEvidence.flatMap(debugLeakRule),
    // Pattern-based security rules
    ...routeEvidence.flatMap(ssrfRule),
    ...routeEvidence.flatMap(commandInjectionRule),
    ...routeEvidence.flatMap(hardcodedSecretRule),
    ...routeEvidence.flatMap(sqlInjectionRule),
    ...routeEvidence.flatMap(pathTraversalRule),
    ...routeEvidence.flatMap(insecureDeserializationRule),
    // Pattern-based quality rules
    ...routeEvidence.flatMap(inputValidationRule),
    ...routeEvidence.flatMap(errorLeakRule),
    ...routeEvidence.flatMap(logInjectionRule),
    ...routeEvidence.flatMap(sensitiveDataRule),
    ...routeEvidence.flatMap(cspMissingRule),
    ...routeEvidence.flatMap(httpsEnforcementRule),
    ...routeEvidence.flatMap(nPlusOneRule),
    ...routeEvidence.flatMap(piiExposureRule),
    ...routeEvidence.flatMap(paymentIdempotencyRule),
    ...routeEvidence.flatMap(transactionSafetyRule),
    ...routeEvidence.flatMap(concurrencyRule),
    ...routeEvidence.flatMap(featureFlagRule),
    ...routeEvidence.flatMap(requestTimeoutRule),
    ...routeEvidence.flatMap(connectionPoolingRule),
    // Agent rules
    ...routeEvidence.flatMap(agentCodeExecRule),
    ...routeEvidence.flatMap(mcpServerAuthRule),
    ...routeEvidence.flatMap(agentToolLimitRule),
    ...routeEvidence.flatMap(promptInjectionRule),
    ...routeEvidence.flatMap(contextLeakRule),
    // Call graph analysis rules (cross-file, data flow)
    ...taintPathFindings(taintPaths),
    ...authChainFindings(authGaps),
    // Project-level rules
    ...envContractRule(inventory, usedEnvVars, declaredEnvVars),
    ...migrationPostureRule(inventory),
    ...(await depsVulnerabilityFindings(inventory)),
    ...(await dockerSecurityFindings(inventory)),
    ...missingTestsRule(inventory),
    ...tsStrictRule(inventory),
    ...missingDocsRule(inventory),
    ...npmPublishRule(inventory),
    ...(await librarySdkFindings(root, inventory)),
    ...(await cliToolFindings(inventory)),
    ...(await mqWorkerFindings(root, inventory)),
    ...(await iacFindings(root, inventory)),
    ...(await paymentSystemFindings(root, inventory)),
    ...(await authServiceFindings(root, inventory)),
    ...projectTypeFindings(inventory),
    ...(await gracefulShutdownRule(inventory)),
    ...(await healthCheckRule(inventory)),
  ];

  return { findings, inventory };
}
