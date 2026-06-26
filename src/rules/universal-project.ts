import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";

// ─── Project type detection ─────────────────────────────────────

export type ProjectKind =
  | "web-app" | "cli-tool" | "library-sdk" | "desktop-app" | "mobile-app"
  | "game" | "ml-pipeline" | "iac" | "browser-extension" | "ide-plugin"
  | "cicd-pipeline" | "migration-tool" | "mq-worker" | "api-gateway"
  | "cron-job" | "wasm-module" | "blockchain" | "iot-embedded"
  | "devops-script" | "serverless-func" | "static-site" | "cms"
  | "monitoring-tool" | "auth-service" | "payment-system"
  | "unknown";

export function detectProjectKind(inventory: ProjectInventory, files: string[]): ProjectKind {
  const deps = inventory.packageJson?.dependencies ?? {};
  const devDeps = inventory.packageJson?.devDependencies ?? {};
  const allDeps = { ...deps, ...devDeps };
  const depNames = Object.keys(allDeps);
  const fileStr = files.join(" ").toLowerCase();

  if (depNames.some(d => d.includes("next") || d.includes("react") || d.includes("vue") || d.includes("svelte") || d.includes("express") || d.includes("fastify") || d.includes("flask") || d.includes("django") || d.includes("gin") || d.includes("actix"))) return "web-app";
  if (depNames.some(d => d.includes("electron") || d.includes("tauri") || d.includes("wpf") || d.includes("swiftui"))) return "desktop-app";
  if (depNames.some(d => d.includes("react-native") || d.includes("flutter") || d.includes("swift") || d.includes("kotlin") || d.includes("capacitor"))) return "mobile-app";
  if (depNames.some(d => d.includes("unity") || d.includes("unreal") || d.includes("godot") || d.includes("phaser") || d.includes("pixi"))) return "game";
  if (depNames.some(d => d.includes("tensorflow") || d.includes("pytorch") || d.includes("scikit") || d.includes("pandas") || d.includes("airflow") || d.includes("spark"))) return "ml-pipeline";
  if (depNames.some(d => d.includes("terraform") || d.includes("pulumi") || d.includes("cdk") || d.includes("ansible"))) return "iac";
  if (depNames.some(d => d.includes("webextension") || d.includes("chrome-extension") || d.includes("browser-ext"))) return "browser-extension";
  if (depNames.some(d => d.includes("puppeteer") || d.includes("playwright") || d.includes("cypress") || d.includes("selenium"))) return "cicd-pipeline";
  if (depNames.some(d => d.includes("prisma") || d.includes("typeorm") || d.includes("knex") || d.includes("alembic") || d.includes("flyway"))) return "migration-tool";
  if (depNames.some(d => d.includes("kafka") || d.includes("rabbitmq") || d.includes("amqp") || d.includes("bull") || d.includes("sqs"))) return "mq-worker";
  if (depNames.some(d => d.includes("nginx") || d.includes("kong") || d.includes("traefik") || d.includes("envoy"))) return "api-gateway";
  if (depNames.some(d => d.includes("cron") || d.includes("schedule") || d.includes("node-cron") || d.includes("celery"))) return "cron-job";
  if (depNames.some(d => d.includes("wasm") || d.includes("wasm-pack") || d.includes("wasm-bindgen"))) return "wasm-module";
  if (depNames.some(d => d.includes("web3") || d.includes("ethers") || d.includes("solana") || d.includes("hardhat") || d.includes("truffle"))) return "blockchain";
  if (depNames.some(d => d.includes("raspberry") || d.includes("arduino") || d.includes("esp") || d.includes("mqtt"))) return "iot-embedded";
  if (depNames.some(d => d.includes("serverless") || d.includes("aws-lambda") || d.includes("@azure/functions") || d.includes("@google-cloud/functions"))) return "serverless-func";
  if (depNames.some(d => d.includes("gatsby") || d.includes("hugo") || d.includes("jekyll") || d.includes("astro") || d.includes("11ty"))) return "static-site";
  if (depNames.some(d => d.includes("strapi") || d.includes("contentful") || d.includes("sanity") || d.includes("wordpress"))) return "cms";
  if (depNames.some(d => d.includes("prometheus") || d.includes("grafana") || d.includes("datadog") || d.includes("newrelic") || d.includes("sentry"))) return "monitoring-tool";
  if (depNames.some(d => d.includes("passport") || d.includes("oauth") || d.includes("keycloak") || d.includes("auth0") || d.includes("clerk"))) return "auth-service";
  if (depNames.some(d => d.includes("stripe") || d.includes("paypal") || d.includes("square") || d.includes("adyen"))) return "payment-system";

  // Default detection by file patterns
  if (fileStr.includes("bin/") || fileStr.includes("cli") || fileStr.includes("command")) return "cli-tool";
  if (fileStr.includes("index.ts") || fileStr.includes("index.js") || fileStr.includes("lib/") || fileStr.includes("src/")) return "library-sdk";

  return "unknown";
}

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
  // For recognized stacks with API routes, web-level checks already cover detailed concerns
  // For projects without any API routes, this is purely informational
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
