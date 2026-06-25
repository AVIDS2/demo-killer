import type { Finding } from "../types.js";
import type { RouteSourceEvidence } from "../source-inspector.js";

export function connectionPoolingRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("consumesRequestBody")) return [];
  if (!route.capabilities.some(c => ["readsDatabase", "mutatesDatabase"].includes(c))) return [];
  if (route.controls.includes("connectionPooling")) return [];

  return [{
    ruleId: "DK-PERF-002",
    title: "Database access without evidence of connection pooling",
    severity: "medium",
    confidence: "low",
    entryPoint: route.path,
    capability: "Database call without pooling guard",
    asset: "database connection efficiency",
    missingControls: ["connectionPooling"],
    consequence: "Each request creates a new database connection. Under load, this exhausts database connection limits and causes 'too many connections' errors.",
    acceptanceCriteria: [
      "Database client uses a connection pool (e.g. Prisma default, pg.Pool, SQLAlchemy pool).",
      "Pool size is configured for expected concurrency.",
      "Connections are properly released after use.",
    ],
    evidence: [{ id: "route-source", detector: "source-inspector", location: { path: route.path, line: route.line }, entryPoint: route.path, capability: "noPooling", asset: "database connections", controls: route.controls, signals: route.capabilities }],
  }];
}
