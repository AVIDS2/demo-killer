import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import type { ProjectKind } from "../project-kind.js";

export type { ProjectKind };

// ─── Production readiness concerns per project type ─────────────

const PROJECT_CONCERNS: Record<ProjectKind, { title: string; checks: string[]; severity: string }> = {
  "web-app": { title: "Web Application", checks: ["auth", "webhook", "CORS", "rate limit", "SQL injection", "SSRF", "PII"], severity: "blocker" },
  "cli-tool": { title: "CLI Tool", checks: ["arg validation", "SIGTERM handler", "error exit codes", "--help output", "stdin/stdout safety", "config file parsing"], severity: "high" },
  "library-sdk": { title: "Library / SDK", checks: ["TypeScript types exported", "error types defined", "API stability versioning", "tree-shaking support", "bundle size awareness", "deprecation warnings"], severity: "high" },
  "desktop-app": { title: "Desktop Application", checks: ["auto-update mechanism", "crash reporting", "sandbox security", "signed binaries", "permission model", "local data encryption"], severity: "blocker" },
  "mobile-app": { title: "Mobile Application", checks: ["secure storage", "certificate pinning", "background task safety", "push notification auth", "deep link validation", "biometric auth"], severity: "blocker" },
  "game": { title: "Game / Interactive", checks: ["anti-cheat measures", "save data integrity", "network protocol security", "asset licensing", "performance profiling", "memory leak detection"], severity: "high" },
  "ml-pipeline": { title: "ML / Data Pipeline", checks: ["data validation", "model versioning", "pipeline idempotency", "GPU resource limits", "training data privacy", "inference timeout"], severity: "high" },
  "iac": { title: "Infrastructure as Code", checks: ["secret management", "state file encryption", "drift detection", "least privilege IAM", "resource tagging", "rollback plan"], severity: "blocker" },
  "browser-extension": { title: "Browser Extension", checks: ["permission minimization", "content script isolation", "message validation", "storage security", "update mechanism", "CSP compliance"], severity: "blocker" },
  "ide-plugin": { title: "IDE Plugin / Extension", checks: ["file system access safety", "process execution limits", "telemetry consent", "auto-update", "workspace trust"], severity: "high" },
  "cicd-pipeline": { title: "CI/CD Pipeline", checks: ["secret masking", "artifact integrity", "pipeline as code review", "runner security", "deployment gate"], severity: "blocker" },
  "migration-tool": { title: "Database Migration", checks: ["down migration tested", "data backfill safety", "locking strategy", "rollback plan", "dry-run mode", "large table handling"], severity: "blocker" },
  "mq-worker": { title: "Message Queue Worker", checks: ["message idempotency", "dead letter queue", "retry backoff", "poison message handling", "concurrency limit", "graceful shutdown"], severity: "high" },
  "api-gateway": { title: "API Gateway / Proxy", checks: ["rate limiting", "request validation", "TLS termination", "header sanitization", "upstream health check", "circuit breaker"], severity: "blocker" },
  "cron-job": { title: "Cron Job / Scheduled Task", checks: ["overlap prevention", "failure alerting", "timeout handling", "idempotency", "retry logic", "locking mechanism"], severity: "high" },
  "wasm-module": { title: "WebAssembly Module", checks: ["memory safety", "capability restriction", "WASI compliance", "host function validation", "deterministic execution"], severity: "high" },
  "blockchain": { title: "Blockchain / Web3", checks: ["reentrancy guard", "access control", "integer overflow", "gas optimization", "upgrade mechanism", "oracle trust model"], severity: "blocker" },
  "iot-embedded": { title: "IoT / Embedded", checks: ["firmware signing", "secure boot", "OTA update safety", "credential storage", "network isolation", "physical access protection"], severity: "blocker" },
  "devops-script": { title: "DevOps Script", checks: ["error handling", "dry-run mode", "idempotency", "logging", "rollback capability", "credential rotation"], severity: "high" },
  "serverless-func": { title: "Serverless Function", checks: ["cold start handling", "timeout config", "concurrency limit", "idempotency", "error handling", "cost limits"], severity: "high" },
  "static-site": { title: "Static Site", checks: ["build output validation", "asset optimization", "SEO metadata", "accessibility", "cache headers", "redirect handling"], severity: "medium" },
  "cms": { title: "Content Management System", checks: ["content API auth", "media upload safety", "preview isolation", "role-based access", "content versioning", "webhook security"], severity: "blocker" },
  "monitoring-tool": { title: "Monitoring / Observability", checks: ["data retention policy", "alert threshold config", "PII in logs", "dashboard access control", "metric cardinality", "storage scaling"], severity: "high" },
  "auth-service": { title: "Authentication Service", checks: ["token rotation", "session management", "brute force protection", "OAuth flow security", "MFA enforcement", "audit logging"], severity: "blocker" },
  "payment-system": { title: "Payment System", checks: ["PCI compliance", "idempotency", "amount validation", "currency handling", "refund safety", "fraud detection"], severity: "blocker" },
  "unknown": { title: "Unknown", checks: ["Verify project purpose", "Review deployment process", "Check access controls", "Audit dependencies", "Test failure scenarios"], severity: "advisory" },
};

// ─── Generate findings ──────────────────────────────────────────

export function projectTypeFindings(inventory: ProjectInventory): Finding[] {
  const kind = inventory.projectKind || "unknown";
  const concerns = PROJECT_CONCERNS[kind] || PROJECT_CONCERNS.unknown;
  const findings: Finding[] = [];
  // DK-UNIVERSAL-001 is purely informational — deep rules handle actual detection
  const effectiveSeverity = "advisory";

  // Main project type advisory
  findings.push({
    ruleId: "DK-UNIVERSAL-001",
    title: `Project type: ${concerns.title} — ${concerns.checks.length} production concerns to verify`,
    severity: effectiveSeverity,
    confidence: "medium",
    missingControls: concerns.checks,
    consequence: `As a ${concerns.title.toLowerCase()}, this project has specific production readiness requirements beyond generic code quality checks.`,
    acceptanceCriteria: concerns.checks.map(c => `Verify: ${c}`),
    evidence: [{ id: "project-kind", detector: "inventory", location: { path: "package.json" }, controls: [], signals: [concerns.title] }],
  });

  return findings;
}
