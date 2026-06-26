import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

// Check for payment-related routes without idempotency
export function paymentIdempotencyRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("handlesPaymentProvider")) return [];
  if (route.controls.includes("idempotency")) return [];

  return [{
    ruleId: "DK-BIZ-001",
    title: "Payment handler lacks idempotency protection",
    severity: "blocker",
    confidence: "high",
    entryPoint: route.path,
    capability: "Processes payments without idempotency key",
    asset: "payment processing",
    missingControls: ["idempotency"],
    consequence: "Network retries can cause duplicate charges. Payment providers recommend idempotency keys for all charge/create operations.",
    acceptanceCriteria: [
      "Payment operations use idempotency keys (Idempotency-Key header or equivalent).",
      "Duplicate requests with same idempotency key return the original result.",
      "Idempotency keys are stored and checked before processing."
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "paymentWithoutIdempotency", asset: "payment processing", controls: route.controls, signals: route.capabilities }],
  }];
}

// Check for state-changing operations without transaction/rollback
export function transactionSafetyRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("mutatesDatabase")) return [];
  if (route.controls.includes("transactionSafety")) return [];

  return [{
    ruleId: "DK-BIZ-002",
    title: "Database mutation without transaction or rollback safety",
    severity: "high",
    confidence: "medium",
    entryPoint: route.path,
    capability: "Mutates data without transactional safety",
    asset: "data integrity",
    missingControls: ["transactionSafety"],
    consequence: "Partial writes during failures leave data in inconsistent state. No BEGIN/COMMIT/ROLLBACK pattern detected.",
    acceptanceCriteria: [
      "Multi-step mutations use database transactions.",
      "Rollback handlers exist for failure cases.",
      "Idempotent operations preferred over multi-step mutations."
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "noTransaction", asset: "data integrity", controls: route.controls, signals: route.capabilities }],
  }];
}

// Check for concurrent access patterns (read-modify-write without locking)
export function concurrencyRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("readsDatabase") || !route.capabilities.includes("mutatesDatabase")) return [];
  if (route.controls.includes("concurrencyControl")) return [];

  return [{
    ruleId: "DK-BIZ-003",
    title: "Read-modify-write without concurrency control",
    severity: "high",
    confidence: "low",
    entryPoint: route.path,
    capability: "Reads then writes without locking",
    asset: "data consistency",
    missingControls: ["concurrencyControl"],
    consequence: "Concurrent requests can produce lost updates, double spends, or inconsistent state due to TOCTOU race conditions.",
    acceptanceCriteria: [
      "Read-modify-write operations use SELECT FOR UPDATE or optimistic locking.",
      "Version fields or timestamps used for optimistic concurrency.",
      "Critical sections are guarded by distributed locks."
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "readModifyWrite", asset: "data consistency", controls: route.controls, signals: route.capabilities }],
  }];
}

// Check for feature flag / config-driven deployment patterns
export function featureFlagRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("consumesRequestBody")) return [];
  if (route.controls.includes("circuitBreaker")) return [];

  return [{
    ruleId: "DK-BIZ-004",
    title: "External service call without circuit breaker or fallback",
    severity: "medium",
    confidence: "low",
    entryPoint: route.path,
    capability: "External call without resilience pattern",
    asset: "service resilience",
    missingControls: ["circuitBreaker"],
    consequence: "If the external service fails or slows down, this endpoint degrades without any fallback, timeout, or circuit breaker.",
    acceptanceCriteria: [
      "External calls have circuit breakers or retry with exponential backoff.",
      "Fallback responses are provided when external services are unavailable.",
      "External call timeouts are shorter than the endpoint timeout."
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "noCircuitBreaker", asset: "service resilience", controls: route.controls, signals: route.capabilities }],
  }];
}
