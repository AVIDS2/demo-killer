import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

async function walkSourceFiles(root: string, exts: string[]): Promise<string[]> {
  const SKIP = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "target", "vendor"]);
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (exts.some(ext => e.name.endsWith(ext))) results.push(path.relative(root, full));
    }
  }
  await walk(root);
  return results;
}

// ─── Payment System Deep Rules ───────────────────────────────────

export async function paymentSystemFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "payment-system") return [];

  const allFiles = await walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb"]);
  const allContent = (await Promise.all(allFiles.map(f => readFileContent(root, f)))).join("\n");

  // DK-PAY-001: No PCI data handling awareness
  // PCI awareness = compliance measures, NOT card data keywords
  const hasPCIAwareness =
    /pci[_-]?dss/i.test(allContent) ||
    /tokenize/i.test(allContent) ||
    /secure[_-]?element/i.test(allContent) ||
    /stripe\.tokens?\b/i.test(allContent) ||
    /payment[_-]?method[_-]?id/i.test(allContent);

  const storesCardData =
    /card[_-]?number\s*[=:]/i.test(allContent) ||
    /credit[_-]?card/i.test(allContent) ||
    /\bpan\s*[=:]/i.test(allContent) ||
    /cvv\s*[=:]/i.test(allContent);

  if (storesCardData && !hasPCIAwareness) {
    findings.push({
      ruleId: "DK-PAY-001",
      title: "Card data handling without PCI compliance awareness",
      severity: "blocker",
      confidence: "high",
      missingControls: ["pciCompliance"],
      consequence: "Storing or processing card data without PCI DSS compliance is a regulatory violation. Card numbers, CVVs, and magnetic stripe data must never be stored unencrypted.",
      acceptanceCriteria: [
        "Card data is tokenized via payment provider (Stripe, Braintree, etc.).",
        "Raw card numbers are never stored in databases or logs.",
        "PCI DSS compliance is documented and audited.",
      ],
      evidence: [{ id: "payment-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["card data storage without PCI awareness"] }],
    });
  }

  // DK-PAY-002: No amount validation on payment endpoints
  const hasAmountValidation =
    /amount\s*[<>]=?\s*\d/i.test(allContent) ||
    /amount\s*[<>]=?\s*0/i.test(allContent) ||
    /validate.*amount/i.test(allContent) ||
    /parseFloat.*amount.*(?:isNaN|<\s*0|>\s*MAX)/i.test(allContent) ||
    /min[_-]?amount|max[_-]?amount/i.test(allContent);

  const handlesAmounts = /amount\s*[=:]/i.test(allContent) || /price\s*[=:]/i.test(allContent);

  if (handlesAmounts && !hasAmountValidation) {
    findings.push({
      ruleId: "DK-PAY-002",
      title: "Payment amounts not validated (no min/max/bounds check)",
      severity: "blocker",
      confidence: "high",
      missingControls: ["amountValidation"],
      consequence: "Without amount validation, attackers can submit zero, negative, or astronomically large amounts. Floating point issues can cause incorrect charges.",
      acceptanceCriteria: [
        "Amounts are validated with min/max bounds before processing.",
        "Amounts are handled as integers (cents) to avoid floating point issues.",
        "Maximum amount limits are enforced per transaction.",
      ],
      evidence: [{ id: "payment-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["amount handling without validation"] }],
    });
  }

  // DK-PAY-003: No currency handling awareness
  const hasCurrencyHandling =
    /currency\s*[=:]/i.test(allContent) ||
    /iso[_-]?4217/i.test(allContent) ||
    /\bUSD\b|\bEUR\b|\bGBP\b|\bCNY\b/.test(allContent) ||
    /currency[_-]?code/i.test(allContent);

  if (handlesAmounts && !hasCurrencyHandling) {
    findings.push({
      ruleId: "DK-PAY-003",
      title: "Payment processing without currency handling",
      severity: "high",
      confidence: "medium",
      missingControls: ["currencyHandling"],
      consequence: "Multi-currency payments without explicit currency handling can cause incorrect charges. Different currencies have different decimal places (JPY has 0, USD has 2).",
      acceptanceCriteria: [
        "Currency code is always specified alongside amounts.",
        "Decimal precision is handled per currency (not hardcoded to 2).",
        "Currency conversion uses verified exchange rates.",
      ],
      evidence: [{ id: "payment-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["amounts without currency specification"] }],
    });
  }

  // DK-PAY-004: No refund safety controls
  const hasRefundSafety =
    /refund.*max/i.test(allContent) ||
    /refund.*limit/i.test(allContent) ||
    /refund.*approv/i.test(allContent) ||
    /partial[_-]?refund/i.test(allContent) ||
    /refund.*idempotency/i.test(allContent);

  const handlesRefunds = /refund/i.test(allContent);

  if (handlesRefunds && !hasRefundSafety) {
    findings.push({
      ruleId: "DK-PAY-004",
      title: "Refund handling without safety controls",
      severity: "blocker",
      confidence: "medium",
      missingControls: ["refundSafety"],
      consequence: "Uncontrolled refunds can be exploited for fraud. Without limits and approval workflows, an attacker (or bug) can drain revenue via unlimited refunds.",
      acceptanceCriteria: [
        "Refund amounts are capped (cannot exceed original payment).",
        "Refunds require approval workflow for large amounts.",
        "Refund operations are idempotent and logged for audit.",
      ],
      evidence: [{ id: "payment-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["refund handling without safety controls"] }],
    });
  }

  return findings;
}

// ─── Auth Service Deep Rules ─────────────────────────────────────

export async function authServiceFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "auth-service") return [];

  const allFiles = await walkSourceFiles(root, [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb"]);
  const allContent = (await Promise.all(allFiles.map(f => readFileContent(root, f)))).join("\n");

  // DK-AUTHSVC-001: No token rotation mechanism
  const hasTokenRotation =
    /refresh[_-]?token/i.test(allContent) ||
    /token[_-]?rotation/i.test(allContent) ||
    /rotate[_-]?token/i.test(allContent) ||
    /renew[_-]?token/i.test(allContent) ||
    /token[_-]?expiry/i.test(allContent) ||
    /expiresIn/i.test(allContent);

  if (!hasTokenRotation) {
    findings.push({
      ruleId: "DK-AUTHSVC-001",
      title: "No token rotation or refresh mechanism detected",
      severity: "blocker",
      confidence: "high",
      missingControls: ["tokenRotation"],
      consequence: "Without token rotation, compromised tokens are valid indefinitely. Long-lived tokens are a primary attack vector in credential theft.",
      acceptanceCriteria: [
        "Access tokens have short expiry (15-60 minutes).",
        "Refresh tokens are used to obtain new access tokens.",
        "Refresh tokens can be revoked and have their own expiry.",
        "Token rotation invalidates the old refresh token.",
      ],
      evidence: [{ id: "auth-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no token rotation found"] }],
    });
  }

  // DK-AUTHSVC-002: No brute force protection
  const hasBruteForceProtection =
    /rate[_-]?limit/i.test(allContent) ||
    /brute[_-]?force/i.test(allContent) ||
    /lockout/i.test(allContent) ||
    /max[_-]?attempts/i.test(allContent) ||
    /login[_-]?attempts/i.test(allContent) ||
    /captcha|recaptcha|turnstile/i.test(allContent) ||
    /slow[_-]?down/i.test(allContent) ||
    /fail2ban/i.test(allContent);

  if (!hasBruteForceProtection) {
    findings.push({
      ruleId: "DK-AUTHSVC-002",
      title: "No brute force protection on authentication endpoints",
      severity: "blocker",
      confidence: "high",
      missingControls: ["bruteForceProtection"],
      consequence: "Without rate limiting or lockout, attackers can make unlimited login attempts. This enables credential stuffing, password spraying, and brute force attacks.",
      acceptanceCriteria: [
        "Login endpoints have rate limiting per IP and per account.",
        "Account lockout after N failed attempts with exponential backoff.",
        "CAPTCHA or proof-of-work after repeated failures.",
        "Failed login attempts are logged for monitoring.",
      ],
      evidence: [{ id: "auth-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no brute force protection found"] }],
    });
  }

  // DK-AUTHSVC-003: Session management weaknesses
  // Check for security flags being ENABLED, not just mentioned (avoid matching comments or httpOnly: false)
  const hasSecureSession =
    /httpOnly\s*[=:]\s*(?:true|1)/i.test(allContent) ||
    /secure\s*[=:]\s*true/i.test(allContent) ||
    /sameSite\s*[=:]\s*(?:"(?:strict|lax)"|'(?:strict|lax)'|(?:strict|lax))/i.test(allContent) ||
    /session[_-]?store/i.test(allContent) ||
    /session[_-]?timeout/i.test(allContent) ||
    /max[_-]?age\s*[=:]\s*[1-9]/i.test(allContent);

  const usesSessions = /session/i.test(allContent) || /cookie/i.test(allContent);

  if (usesSessions && !hasSecureSession) {
    findings.push({
      ruleId: "DK-AUTHSVC-003",
      title: "Session management without security flags",
      severity: "blocker",
      confidence: "high",
      missingControls: ["sessionManagement"],
      consequence: "Sessions without HttpOnly, Secure, and SameSite flags are vulnerable to XSS-based session hijacking and CSRF attacks. Missing session timeout allows indefinite session reuse.",
      acceptanceCriteria: [
        "Session cookies have HttpOnly, Secure, and SameSite flags.",
        "Session timeout is configured (absolute and idle).",
        "Sessions are stored server-side (not just in JWT).",
        "Session invalidation works on logout.",
      ],
      evidence: [{ id: "auth-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["session without security flags"] }],
    });
  }

  // DK-AUTHSVC-004: No audit logging for auth events
  const hasAuditLogging =
    /audit[_-]?log/i.test(allContent) ||
    /auth[_-]?log/i.test(allContent) ||
    /login[_-]?log/i.test(allContent) ||
    /log.*(?:login|logout|password.?change|account.?lock)/i.test(allContent) ||
    /security[_-]?event/i.test(allContent);

  if (!hasAuditLogging) {
    findings.push({
      ruleId: "DK-AUTHSVC-004",
      title: "No audit logging for authentication events",
      severity: "high",
      confidence: "medium",
      missingControls: ["auditLogging"],
      consequence: "Without audit logs, security incidents (unauthorized access, credential stuffing, account takeover) cannot be detected or investigated. Compliance requirements (SOC2, ISO27001) mandate auth event logging.",
      acceptanceCriteria: [
        "Login successes and failures are logged with IP, user-agent, timestamp.",
        "Password changes, account lockouts, and MFA events are logged.",
        "Audit logs are immutable and stored separately from application logs.",
      ],
      evidence: [{ id: "auth-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no audit logging for auth events"] }],
    });
  }

  return findings;
}
