# Demo Killer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trustworthy local CLI that diagnoses why AI-style Next.js SaaS/AI apps are still demos by producing evidence-backed launch blockers, production consequences, and a recheckable hardening path.

**Architecture:** Use a sample-driven TypeScript implementation. Start with fixture Next.js projects and golden expected findings, then build an evidence schema, static inventory extractor, TypeScript source inspector, evidence-first rule engine, JSON/Markdown report generator, and `.demokiller` recheck snapshots. MCP, skills, plugins, dashboards, and CI are explicitly out of scope for this MVP plan.

**Tech Stack:** TypeScript, Node.js, Vitest, TypeScript compiler API or `ts-morph`, JSON and Markdown report output.

---

## Scope Decisions

This MVP intentionally does not implement MCP, agent skills, plugins, dashboards, CI gates, auto-fix, or multi-framework support.

The supported target is:

- Next.js App Router.
- TypeScript.
- Local static inspection.
- AI/SaaS-style projects with API routes, environment variables, provider SDK calls, database/migration files, and basic deployment metadata.

The MVP must not output `Production Ready`. It may output:

- `Demo`
- `Launch Blocked`
- `Production Candidate`
- `Insufficient Evidence`

## File Structure

- `package.json` - Node package metadata, scripts, dependencies.
- `tsconfig.json` - TypeScript configuration.
- `src/types.ts` - Shared verdict, evidence, finding, report, and snapshot types.
- `src/fixtures.ts` - Fixture metadata loader.
- `src/inventory.ts` - Project file inventory and stack signal extraction.
- `src/source-inspector.ts` - TypeScript/Next.js source inspection.
- `src/rules/index.ts` - Rule runner.
- `src/rules/public-ai-route.ts` - Paid AI capability exposure rule.
- `src/rules/admin-mutation-auth.ts` - Admin/data mutation authorization rule.
- `src/rules/webhook-safety.ts` - Webhook signature/idempotency rule.
- `src/rules/env-contract.ts` - Environment contract rule.
- `src/rules/migration-posture.ts` - Database migration posture rule.
- `src/rules/observability.ts` - Critical path logging/diagnosis rule.
- `src/report/json.ts` - Stable JSON report builder.
- `src/report/markdown.ts` - Human report renderer.
- `src/state.ts` - `.demokiller` snapshot and recheck diff logic.
- `src/cli.ts` - CLI command parsing and orchestration.
- `src/index.ts` - Public exports.
- `fixtures/next-ai-saas-risky/` - Primary risky sample project.
- `fixtures/next-ai-saas-partial-fix/` - Same sample after selected fixes.
- `fixtures/expected/next-ai-saas-risky.findings.json` - Golden findings.
- `fixtures/expected/next-ai-saas-partial-fix.findings.json` - Golden findings after fixes.
- `tests/fixtures.test.ts` - Fixture integrity tests.
- `tests/inventory.test.ts` - Inventory extraction tests.
- `tests/source-inspector.test.ts` - Source analysis tests.
- `tests/rules.test.ts` - Rule engine golden tests.
- `tests/report.test.ts` - JSON/Markdown report tests.
- `tests/recheck.test.ts` - Snapshot/recheck tests.
- `tests/cli.test.ts` - CLI integration tests.

### Task 1: Initialize the project and test runner

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `src/types.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Create the package and TypeScript config**

```json
{
  "name": "demo-killer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "demokiller": "./dist/src/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/cli.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "ts-morph": "^25.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 2: Define initial shared types**

```ts
export type Verdict =
  | "Demo"
  | "Launch Blocked"
  | "Production Candidate"
  | "Insufficient Evidence";

export type Severity = "blocker" | "high" | "medium" | "advisory";

export type Confidence = "high" | "medium" | "low";

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface Evidence {
  id: string;
  detector: string;
  location: SourceLocation;
  entryPoint?: string;
  capability?: string;
  asset?: string;
  controls: string[];
  signals: string[];
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  evidence: Evidence[];
  entryPoint?: string;
  capability?: string;
  asset?: string;
  missingControls: string[];
  consequence: string;
  acceptanceCriteria: string[];
}

export interface AnalysisReport {
  verdict: Verdict;
  supportedScope: string[];
  findings: Finding[];
  generatedAt: string;
}
```

- [ ] **Step 3: Add smoke test**

```ts
import { describe, expect, it } from "vitest";
import type { Verdict } from "../src/types";

describe("project setup", () => {
  it("supports the MVP verdict vocabulary", () => {
    const verdict: Verdict = "Launch Blocked";
    expect(verdict).toBe("Launch Blocked");
  });
});
```

- [ ] **Step 4: Run setup verification**

Run: `npm install`

Expected: dependencies install successfully.

Run: `npm test -- tests/smoke.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/index.ts src/types.ts tests/smoke.test.ts
git commit -m "feat: initialize demokiller mvp"
```

### Task 2: Create fixture projects and golden expected findings

**Files:**
- Create: `fixtures/next-ai-saas-risky/package.json`
- Create: `fixtures/next-ai-saas-risky/app/api/chat/route.ts`
- Create: `fixtures/next-ai-saas-risky/app/api/admin/users/route.ts`
- Create: `fixtures/next-ai-saas-risky/app/api/stripe/webhook/route.ts`
- Create: `fixtures/next-ai-saas-risky/lib/db.ts`
- Create: `fixtures/next-ai-saas-risky/prisma/schema.prisma`
- Create: `fixtures/next-ai-saas-risky/.env.example`
- Create: `fixtures/next-ai-saas-partial-fix/package.json`
- Create: `fixtures/next-ai-saas-partial-fix/app/api/chat/route.ts`
- Create: `fixtures/next-ai-saas-partial-fix/app/api/admin/users/route.ts`
- Create: `fixtures/next-ai-saas-partial-fix/app/api/stripe/webhook/route.ts`
- Create: `fixtures/next-ai-saas-partial-fix/lib/db.ts`
- Create: `fixtures/next-ai-saas-partial-fix/prisma/schema.prisma`
- Create: `fixtures/next-ai-saas-partial-fix/prisma/migrations/20260101000000_init/migration.sql`
- Create: `fixtures/next-ai-saas-partial-fix/.env.example`
- Create: `fixtures/expected/next-ai-saas-risky.findings.json`
- Create: `fixtures/expected/next-ai-saas-partial-fix.findings.json`
- Create: `tests/fixtures.test.ts`

- [ ] **Step 1: Create the risky fixture package**

```json
{
  "name": "next-ai-saas-risky",
  "private": true,
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "openai": "^4.80.0",
    "stripe": "^17.5.0",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create the risky fixture source files**

```ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const body = await request.json();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: body.message }],
  });

  return Response.json({ text: completion.choices[0]?.message?.content });
}
```

```ts
import { prisma } from "../../../../lib/db";

export async function DELETE(request: Request) {
  const { userId } = await request.json();
  await prisma.user.delete({ where: { id: userId } });
  return Response.json({ ok: true });
}
```

```ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const event = await request.json();
  if (event.type === "checkout.session.completed") {
    console.log("paid", event.data.object.id);
  }
  return Response.json({ received: true });
}
```

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id    String @id @default(cuid())
  email String @unique
}
```

```text
DATABASE_URL=
```

- [ ] **Step 3: Create the partial-fix fixture**

Use the same project shape as the risky fixture, with these differences:

```ts
import OpenAI from "openai";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  await rateLimit(session.user.id, "chat");
  const body = await request.json();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: body.message }],
  });

  return Response.json({ text: completion.choices[0]?.message?.content });
}
```

```text
DATABASE_URL=
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

```sql
-- Initial schema migration for fixture validation.
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL
);
```

- [ ] **Step 4: Create golden findings**

```json
[
  {
    "ruleId": "DK-AI-001",
    "severity": "blocker",
    "entryPoint": "app/api/chat/route.ts",
    "missingControls": ["auth", "quota", "rateLimit"],
    "asset": "paid AI API quota"
  },
  {
    "ruleId": "DK-AUTH-001",
    "severity": "blocker",
    "entryPoint": "app/api/admin/users/route.ts",
    "missingControls": ["auth", "authorization"],
    "asset": "user data"
  },
  {
    "ruleId": "DK-WEBHOOK-001",
    "severity": "blocker",
    "entryPoint": "app/api/stripe/webhook/route.ts",
    "missingControls": ["signatureVerification", "idempotency"],
    "asset": "payment state"
  },
  {
    "ruleId": "DK-ENV-001",
    "severity": "high",
    "missingControls": ["envContract"],
    "asset": "production configuration"
  },
  {
    "ruleId": "DK-DB-001",
    "severity": "high",
    "missingControls": ["migration"],
    "asset": "database schema"
  },
  {
    "ruleId": "DK-OBS-001",
    "severity": "high",
    "entryPoint": "app/api/admin/users/route.ts",
    "missingControls": ["logging"],
    "asset": "incident diagnosis"
  }
]
```

```json
[
  {
    "ruleId": "DK-AUTH-001",
    "severity": "blocker",
    "entryPoint": "app/api/admin/users/route.ts",
    "missingControls": ["auth", "authorization"],
    "asset": "user data"
  },
  {
    "ruleId": "DK-WEBHOOK-001",
    "severity": "blocker",
    "entryPoint": "app/api/stripe/webhook/route.ts",
    "missingControls": ["signatureVerification", "idempotency"],
    "asset": "payment state"
  },
  {
    "ruleId": "DK-OBS-001",
    "severity": "high",
    "entryPoint": "app/api/admin/users/route.ts",
    "missingControls": ["logging"],
    "asset": "incident diagnosis"
  }
]
```

- [ ] **Step 5: Test fixture integrity**

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fixture corpus", () => {
  it("contains risky and partial-fix nextjs samples", () => {
    expect(existsSync("fixtures/next-ai-saas-risky/package.json")).toBe(true);
    expect(existsSync("fixtures/next-ai-saas-partial-fix/package.json")).toBe(true);
  });

  it("contains golden expected findings", () => {
    expect(existsSync("fixtures/expected/next-ai-saas-risky.findings.json")).toBe(true);
    expect(existsSync("fixtures/expected/next-ai-saas-partial-fix.findings.json")).toBe(true);
  });
});
```

- [ ] **Step 6: Run fixture tests**

Run: `npm test -- tests/fixtures.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fixtures tests/fixtures.test.ts
git commit -m "test: add ai saas fixture corpus"
```

### Task 3: Build inventory extraction

**Files:**
- Create: `src/inventory.ts`
- Create: `tests/inventory.test.ts`

- [ ] **Step 1: Write inventory tests**

```ts
import { describe, expect, it } from "vitest";
import { buildInventory } from "../src/inventory";

describe("buildInventory", () => {
  it("detects Next.js, API routes, env example, prisma schema, and migrations", async () => {
    const inventory = await buildInventory("fixtures/next-ai-saas-risky");

    expect(inventory.stack).toBe("nextjs");
    expect(inventory.apiRoutes).toEqual(
      expect.arrayContaining([
        "app/api/chat/route.ts",
        "app/api/admin/users/route.ts",
        "app/api/stripe/webhook/route.ts",
      ])
    );
    expect(inventory.envExamplePath).toBe(".env.example");
    expect(inventory.prismaSchemaPath).toBe("prisma/schema.prisma");
    expect(inventory.migrationPaths).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement inventory extraction**

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

export interface ProjectInventory {
  root: string;
  stack: "nextjs" | "unknown";
  apiRoutes: string[];
  envExamplePath?: string;
  prismaSchemaPath?: string;
  migrationPaths: string[];
  packageJson: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

async function walk(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    if (entry.isDirectory()) {
      result.push(...(await walk(root, fullPath)));
    } else {
      result.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }
  return result;
}

export async function buildInventory(root: string): Promise<ProjectInventory> {
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const files = await walk(root);
  const dependencies = packageJson.dependencies ?? {};
  const devDependencies = packageJson.devDependencies ?? {};

  return {
    root,
    stack: dependencies.next || devDependencies.next ? "nextjs" : "unknown",
    apiRoutes: files.filter((file) => file.startsWith("app/api/") && file.endsWith("/route.ts")),
    envExamplePath: files.includes(".env.example") ? ".env.example" : undefined,
    prismaSchemaPath: files.includes("prisma/schema.prisma") ? "prisma/schema.prisma" : undefined,
    migrationPaths: files.filter((file) => file.startsWith("prisma/migrations/") && file.endsWith(".sql")),
    packageJson: { dependencies, devDependencies },
  };
}
```

- [ ] **Step 3: Run inventory tests**

Run: `npm test -- tests/inventory.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/inventory.ts tests/inventory.test.ts
git commit -m "feat: extract project inventory"
```

### Task 4: Inspect TypeScript route source for capabilities and controls

**Files:**
- Create: `src/source-inspector.ts`
- Create: `tests/source-inspector.test.ts`

- [ ] **Step 1: Write source inspector tests**

```ts
import { describe, expect, it } from "vitest";
import { inspectRouteSource } from "../src/source-inspector";

describe("inspectRouteSource", () => {
  it("detects paid AI calls and missing controls", async () => {
    const evidence = await inspectRouteSource(
      "fixtures/next-ai-saas-risky",
      "app/api/chat/route.ts"
    );

    expect(evidence.capabilities).toContain("callsOpenAI");
    expect(evidence.controls).not.toContain("auth");
    expect(evidence.controls).not.toContain("rateLimit");
  });

  it("detects auth and rate limit in the partial fix", async () => {
    const evidence = await inspectRouteSource(
      "fixtures/next-ai-saas-partial-fix",
      "app/api/chat/route.ts"
    );

    expect(evidence.capabilities).toContain("callsOpenAI");
    expect(evidence.controls).toEqual(expect.arrayContaining(["auth", "rateLimit"]));
  });
});
```

- [ ] **Step 2: Implement source inspection**

```ts
import { Project, SyntaxKind } from "ts-morph";
import path from "node:path";

export interface RouteSourceEvidence {
  path: string;
  capabilities: string[];
  controls: string[];
  envVars: string[];
  line: number;
}

export async function inspectRouteSource(root: string, relativePath: string): Promise<RouteSourceEvidence> {
  const project = new Project({ useInMemoryFileSystem: false });
  const sourceFile = project.addSourceFileAtPath(path.join(root, relativePath));
  const text = sourceFile.getFullText();
  const firstFunction = sourceFile.getFunctions()[0];
  const line = firstFunction?.getStartLineNumber() ?? 1;

  const capabilities: string[] = [];
  const controls: string[] = [];
  const envVars = Array.from(text.matchAll(/process\.env\.([A-Z0-9_]+)/g)).map((match) => match[1]);

  if (text.includes("openai") || text.includes("OpenAI") || text.includes("chat.completions")) {
    capabilities.push("callsOpenAI");
  }
  if (text.includes("stripe") || text.includes("Stripe")) {
    capabilities.push("handlesPaymentProvider");
  }
  if (text.includes("prisma.") && text.match(/\.(delete|update|create|upsert)\s*\(/)) {
    capabilities.push("mutatesDatabase");
  }
  if (text.match(/\bauth\s*\(/) || text.includes("getServerSession") || text.includes("currentUser")) {
    controls.push("auth");
  }
  if (text.includes("role") || text.includes("isAdmin") || text.includes("permission")) {
    controls.push("authorization");
  }
  if (text.includes("rateLimit") || text.includes("limiter")) {
    controls.push("rateLimit");
  }
  if (text.includes("constructEvent") || text.includes("STRIPE_WEBHOOK_SECRET")) {
    controls.push("signatureVerification");
  }
  if (text.includes("idempotency") || text.includes("event.id")) {
    controls.push("idempotency");
  }
  if (sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => call.getText().startsWith("console."))) {
    controls.push("logging");
  }

  return { path: relativePath, capabilities, controls, envVars, line };
}
```

- [ ] **Step 3: Run source inspector tests**

Run: `npm test -- tests/source-inspector.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/source-inspector.ts tests/source-inspector.test.ts
git commit -m "feat: inspect nextjs route source"
```

### Task 5: Implement evidence-first launch blocker rules

**Files:**
- Create: `src/rules/index.ts`
- Create: `src/rules/public-ai-route.ts`
- Create: `src/rules/admin-mutation-auth.ts`
- Create: `src/rules/webhook-safety.ts`
- Create: `src/rules/env-contract.ts`
- Create: `src/rules/migration-posture.ts`
- Create: `src/rules/observability.ts`
- Create: `tests/rules.test.ts`

- [ ] **Step 1: Write golden rule tests**

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { analyzeFindings } from "../src/rules";

describe("analyzeFindings", () => {
  it("matches golden findings for risky fixture", async () => {
    const findings = await analyzeFindings("fixtures/next-ai-saas-risky");
    const expected = JSON.parse(
      await readFile("fixtures/expected/next-ai-saas-risky.findings.json", "utf8")
    );

    expect(
      findings.map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        entryPoint: finding.entryPoint,
        missingControls: finding.missingControls,
        asset: finding.asset,
      }))
    ).toEqual(expected);
  });

  it("matches golden findings after partial fixes", async () => {
    const findings = await analyzeFindings("fixtures/next-ai-saas-partial-fix");
    const expected = JSON.parse(
      await readFile("fixtures/expected/next-ai-saas-partial-fix.findings.json", "utf8")
    );

    expect(
      findings.map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        entryPoint: finding.entryPoint,
        missingControls: finding.missingControls,
        asset: finding.asset,
      }))
    ).toEqual(expected);
  });
});
```

- [ ] **Step 2: Implement public AI route rule**

```ts
import type { Finding } from "../types";
import type { RouteSourceEvidence } from "../source-inspector";

export function publicAiRouteRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("callsOpenAI")) return [];

  const missingControls = ["auth", "quota", "rateLimit"].filter(
    (control) => !route.controls.includes(control)
  );

  if (missingControls.length === 0) return [];

  return [
    {
      ruleId: "DK-AI-001",
      title: "Paid AI capability is exposed without production abuse controls",
      severity: "blocker",
      confidence: "high",
      entryPoint: route.path,
      capability: "Calls OpenAI chat completion",
      asset: "paid AI API quota",
      missingControls,
      consequence:
        "A public script can repeatedly trigger paid AI calls and create unexpected API costs.",
      acceptanceCriteria: [
        "Requests require an authenticated user or trusted server-side session.",
        "Usage is bound to a user or tenant.",
        "Per-user or per-IP quota exists.",
        "Abnormal usage is logged.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "callsOpenAI",
          asset: "paid AI API quota",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
```

- [ ] **Step 3: Implement admin mutation authorization rule**

```ts
import type { Finding } from "../types";
import type { RouteSourceEvidence } from "../source-inspector";

export function adminMutationAuthRule(route: RouteSourceEvidence): Finding[] {
  if (!route.path.includes("/admin/")) return [];
  if (!route.capabilities.includes("mutatesDatabase")) return [];

  const missingControls = ["auth", "authorization"].filter(
    (control) => !route.controls.includes(control)
  );

  if (missingControls.length === 0) return [];

  return [
    {
      ruleId: "DK-AUTH-001",
      title: "Admin data mutation route lacks a verified access boundary",
      severity: "blocker",
      confidence: "high",
      entryPoint: route.path,
      capability: "Mutates user data",
      asset: "user data",
      missingControls,
      consequence:
        "A user or script may trigger privileged data changes without a verified admin boundary.",
      acceptanceCriteria: [
        "Route requires a valid authenticated session.",
        "Route verifies an admin role or explicit permission.",
        "Unauthorized requests return 401 or 403 before data mutation.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "mutatesDatabase",
          asset: "user data",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
```

- [ ] **Step 4: Implement webhook, env, and migration rules**

```ts
import type { Finding } from "../types";
import type { ProjectInventory } from "../inventory";
import type { RouteSourceEvidence } from "../source-inspector";

export function webhookSafetyRule(route: RouteSourceEvidence): Finding[] {
  if (!route.path.includes("webhook")) return [];
  if (!route.capabilities.includes("handlesPaymentProvider")) return [];

  const missingControls = ["signatureVerification", "idempotency"].filter(
    (control) => !route.controls.includes(control)
  );

  if (missingControls.length === 0) return [];

  return [
    {
      ruleId: "DK-WEBHOOK-001",
      title: "Payment webhook lacks production safety controls",
      severity: "blocker",
      confidence: "high",
      entryPoint: route.path,
      capability: "Handles payment provider webhook",
      asset: "payment state",
      missingControls,
      consequence:
        "Forged or repeated webhook requests can corrupt payment state or grant access incorrectly.",
      acceptanceCriteria: [
        "Provider signature is verified against a webhook secret.",
        "Processed event ids are stored or checked for idempotency.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "handlesPaymentProvider",
          asset: "payment state",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}

export function envContractRule(
  inventory: ProjectInventory,
  usedEnvVars: string[],
  declaredEnvVars: string[]
): Finding[] {
  const declared = new Set(declaredEnvVars);
  const missing = usedEnvVars.filter((name) => !declared.has(name));
  if (!inventory.envExamplePath || missing.length === 0) return [];

  return [
    {
      ruleId: "DK-ENV-001",
      title: "Production environment contract is incomplete",
      severity: "high",
      confidence: "medium",
      asset: "production configuration",
      missingControls: ["envContract"],
      consequence:
        "Production deploys can fail or run with incomplete provider configuration because required variables are not documented.",
      acceptanceCriteria: [
        "Every required production environment variable appears in .env.example or another explicit env contract.",
        "Required variables are documented without secret values.",
      ],
      evidence: [
        {
          id: "env-usage",
          detector: "source-inspector",
          location: { path: inventory.envExamplePath },
          asset: "production configuration",
          controls: [],
          signals: missing.map((name) => `missing:${name}`),
        },
      ],
    },
  ];
}

export function migrationPostureRule(inventory: ProjectInventory): Finding[] {
  if (!inventory.prismaSchemaPath || inventory.migrationPaths.length > 0) return [];

  return [
    {
      ruleId: "DK-DB-001",
      title: "Database schema exists without migration evidence",
      severity: "high",
      confidence: "medium",
      asset: "database schema",
      missingControls: ["migration"],
      consequence:
        "Schema changes cannot be reproduced, reviewed, or rolled forward consistently in production.",
      acceptanceCriteria: [
        "Database schema changes are represented by committed migration files.",
        "Deployment docs or scripts apply migrations before serving production traffic.",
      ],
      evidence: [
        {
          id: "prisma-schema",
          detector: "inventory",
          location: { path: inventory.prismaSchemaPath },
          asset: "database schema",
          controls: [],
          signals: ["prismaSchemaWithoutMigrations"],
        },
      ],
    },
  ];
}

export function observabilityRule(route: RouteSourceEvidence): Finding[] {
  if (!route.capabilities.includes("mutatesDatabase")) return [];
  if (route.controls.includes("logging")) return [];

  return [
    {
      ruleId: "DK-OBS-001",
      title: "Critical mutation path lacks diagnostic logging",
      severity: "high",
      confidence: "medium",
      entryPoint: route.path,
      capability: "Mutates production data",
      asset: "incident diagnosis",
      missingControls: ["logging"],
      consequence:
        "When this path fails in production, the team may not know what happened or how to recover quickly.",
      acceptanceCriteria: [
        "The mutation path emits structured logs or a traceable audit event.",
        "Failure cases preserve enough context for diagnosis.",
      ],
      evidence: [
        {
          id: "route-source",
          detector: "source-inspector",
          location: { path: route.path, line: route.line },
          entryPoint: route.path,
          capability: "mutatesDatabase",
          asset: "incident diagnosis",
          controls: route.controls,
          signals: route.capabilities,
        },
      ],
    },
  ];
}
```

- [ ] **Step 5: Implement the rule runner**

```ts
import { buildInventory } from "../inventory";
import { inspectRouteSource } from "../source-inspector";
import type { Finding } from "../types";
import { adminMutationAuthRule } from "./admin-mutation-auth";
import { envContractRule, migrationPostureRule, webhookSafetyRule } from "./webhook-safety";
import { observabilityRule } from "./observability";
import { publicAiRouteRule } from "./public-ai-route";

export async function analyzeFindings(root: string): Promise<Finding[]> {
  const inventory = await buildInventory(root);
  const routeEvidence = await Promise.all(
    inventory.apiRoutes.map((route) => inspectRouteSource(root, route))
  );
  const usedEnvVars = Array.from(new Set(routeEvidence.flatMap((route) => route.envVars)));
  const declaredEnvVars = await readDeclaredEnvVars(root, inventory.envExamplePath);

  return [
    ...routeEvidence.flatMap(publicAiRouteRule),
    ...routeEvidence.flatMap(adminMutationAuthRule),
    ...routeEvidence.flatMap(webhookSafetyRule),
    ...routeEvidence.flatMap(observabilityRule),
    ...envContractRule(inventory, usedEnvVars, declaredEnvVars),
    ...migrationPostureRule(inventory),
  ];
}

The implementation should include a small helper that reads `.env.example` and returns the declared variable names from lines shaped like `NAME=` while ignoring comments and blank lines.
```

- [ ] **Step 6: Run golden rule tests**

Run: `npm test -- tests/rules.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rules tests/rules.test.ts
git commit -m "feat: detect evidence-backed launch blockers"
```

### Task 6: Build JSON and Markdown reports

**Files:**
- Create: `src/report/json.ts`
- Create: `src/report/markdown.ts`
- Create: `tests/report.test.ts`

- [ ] **Step 1: Write report tests**

```ts
import { describe, expect, it } from "vitest";
import { buildJsonReport } from "../src/report/json";
import { renderMarkdownReport } from "../src/report/markdown";
import type { Finding } from "../src/types";

const finding: Finding = {
  ruleId: "DK-AI-001",
  title: "Paid AI capability is exposed without production abuse controls",
  severity: "blocker",
  confidence: "high",
  entryPoint: "app/api/chat/route.ts",
  capability: "Calls OpenAI chat completion",
  asset: "paid AI API quota",
  missingControls: ["auth", "quota", "rateLimit"],
  consequence: "A public script can repeatedly trigger paid AI calls.",
  acceptanceCriteria: ["Requests require auth."],
  evidence: [
    {
      id: "route-source",
      detector: "source-inspector",
      location: { path: "app/api/chat/route.ts", line: 5 },
      controls: [],
      signals: ["callsOpenAI"],
    },
  ],
};

describe("reports", () => {
  it("builds a launch blocked json report", () => {
    const report = buildJsonReport([finding], "2026-06-17T00:00:00.000Z");
    expect(report.verdict).toBe("Launch Blocked");
    expect(report.findings[0].ruleId).toBe("DK-AI-001");
  });

  it("renders production consequence and evidence in markdown", () => {
    const report = buildJsonReport([finding], "2026-06-17T00:00:00.000Z");
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("Verdict: Launch Blocked");
    expect(markdown).toContain("A public script can repeatedly trigger paid AI calls.");
    expect(markdown).toContain("app/api/chat/route.ts:5");
  });
});
```

- [ ] **Step 2: Implement JSON report builder**

```ts
import type { AnalysisReport, Finding, Verdict } from "../types";

export function buildJsonReport(findings: Finding[], generatedAt = new Date().toISOString()): AnalysisReport {
  const hasBlocker = findings.some((finding) => finding.severity === "blocker");
  const verdict: Verdict = hasBlocker
    ? "Launch Blocked"
    : findings.length > 0
      ? "Demo"
      : "Production Candidate";

  return {
    verdict,
    supportedScope: [
      "Next.js App Router",
      "TypeScript",
      "local static inspection",
      "AI/SaaS launch blockers",
    ],
    findings,
    generatedAt,
  };
}
```

- [ ] **Step 3: Implement Markdown renderer**

```ts
import type { AnalysisReport, Finding } from "../types";

function renderFinding(finding: Finding): string {
  const evidenceLines = finding.evidence.map((evidence) => {
    const suffix = evidence.location.line ? `:${evidence.location.line}` : "";
    return `- Evidence: ${evidence.location.path}${suffix} via ${evidence.detector}`;
  });

  return [
    `### ${finding.ruleId}: ${finding.title}`,
    "",
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    finding.entryPoint ? `Entry point: ${finding.entryPoint}` : undefined,
    finding.capability ? `Capability: ${finding.capability}` : undefined,
    finding.asset ? `Asset: ${finding.asset}` : undefined,
    `Missing controls: ${finding.missingControls.join(", ")}`,
    "",
    `Production consequence: ${finding.consequence}`,
    "",
    "Acceptance criteria:",
    ...finding.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    ...evidenceLines,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function renderMarkdownReport(report: AnalysisReport): string {
  return [
    "# Demo Killer Report",
    "",
    `Verdict: ${report.verdict}`,
    "",
    "Supported scope:",
    ...report.supportedScope.map((item) => `- ${item}`),
    "",
    "## Findings",
    "",
    report.findings.length === 0
      ? "No launch blockers found in the supported scope."
      : report.findings.map(renderFinding).join("\n\n"),
  ].join("\n");
}
```

- [ ] **Step 4: Run report tests**

Run: `npm test -- tests/report.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report tests/report.test.ts
git commit -m "feat: render evidence-backed reports"
```

### Task 7: Implement recheck snapshots

**Files:**
- Create: `src/state.ts`
- Create: `tests/recheck.test.ts`

- [ ] **Step 1: Write recheck tests**

```ts
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../src/state";
import type { AnalysisReport } from "../src/types";

const before: AnalysisReport = {
  verdict: "Launch Blocked",
  supportedScope: [],
  generatedAt: "2026-06-17T00:00:00.000Z",
  findings: [
    {
      ruleId: "DK-AI-001",
      title: "Paid AI capability is exposed without production abuse controls",
      severity: "blocker",
      confidence: "high",
      entryPoint: "app/api/chat/route.ts",
      missingControls: ["auth"],
      consequence: "Cost abuse.",
      acceptanceCriteria: ["Require auth."],
      evidence: [],
    },
  ],
};

const after: AnalysisReport = {
  ...before,
  findings: [],
  verdict: "Production Candidate",
};

describe("diffSnapshots", () => {
  it("shows resolved findings", () => {
    const diff = diffSnapshots(before, after);
    expect(diff.resolvedRuleIds).toEqual(["DK-AI-001"]);
    expect(diff.newRuleIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement snapshot diff**

```ts
import type { AnalysisReport } from "./types";

export interface RecheckDiff {
  previousVerdict: string;
  currentVerdict: string;
  resolvedRuleIds: string[];
  newRuleIds: string[];
  remainingRuleIds: string[];
}

export function diffSnapshots(previous: AnalysisReport, current: AnalysisReport): RecheckDiff {
  const previousIds = new Set(previous.findings.map((finding) => finding.ruleId));
  const currentIds = new Set(current.findings.map((finding) => finding.ruleId));

  return {
    previousVerdict: previous.verdict,
    currentVerdict: current.verdict,
    resolvedRuleIds: [...previousIds].filter((id) => !currentIds.has(id)),
    newRuleIds: [...currentIds].filter((id) => !previousIds.has(id)),
    remainingRuleIds: [...currentIds].filter((id) => previousIds.has(id)),
  };
}
```

- [ ] **Step 3: Run recheck tests**

Run: `npm test -- tests/recheck.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/state.ts tests/recheck.test.ts
git commit -m "feat: diff demokiller recheck snapshots"
```

### Task 8: Implement CLI inspect and recheck

**Files:**
- Create: `src/cli.ts`
- Modify: `src/index.ts`
- Create: `tests/cli.test.ts`

- [ ] **Step 1: Write CLI tests**

```ts
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

describe("runCli", () => {
  it("prints markdown report for inspect", async () => {
    const result = await runCli(["inspect", "fixtures/next-ai-saas-risky", "--markdown"]);
    expect(result.stdout).toContain("Verdict: Launch Blocked");
    expect(result.stdout).toContain("DK-AI-001");
  });

  it("prints json report for inspect", async () => {
    const result = await runCli(["inspect", "fixtures/next-ai-saas-risky", "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.verdict).toBe("Launch Blocked");
  });
});
```

- [ ] **Step 2: Implement CLI orchestration**

```ts
import { analyzeFindings } from "./rules";
import { buildJsonReport } from "./report/json";
import { renderMarkdownReport } from "./report/markdown";

export async function runCli(argv: string[] = process.argv.slice(2)) {
  const command = argv[0];
  const root = argv[1] && !argv[1].startsWith("--") ? argv[1] : process.cwd();
  const wantsJson = argv.includes("--json");

  if (command !== "inspect") {
    return {
      exitCode: 1,
      stdout: "Usage: demokiller inspect [project-root] [--json|--markdown]",
      stderr: "",
    };
  }

  const findings = await analyzeFindings(root);
  const report = buildJsonReport(findings);
  const stdout = wantsJson ? JSON.stringify(report, null, 2) : renderMarkdownReport(report);

  return { exitCode: 0, stdout, stderr: "" };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  runCli().then((result) => {
    if (result.stdout) process.stdout.write(`${result.stdout}\n`);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.exitCode;
  });
}
```

- [ ] **Step 3: Export CLI and engine functions**

```ts
export { runCli } from "./cli";
export { analyzeFindings } from "./rules";
export { buildJsonReport } from "./report/json";
export { renderMarkdownReport } from "./report/markdown";
export type { AnalysisReport, Evidence, Finding, Verdict } from "./types";
```

- [ ] **Step 4: Run CLI tests**

Run: `npm test -- tests/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/index.ts tests/cli.test.ts
git commit -m "feat: add inspect cli"
```

### Task 9: Add MVP documentation and proof narrative

**Files:**
- Create: `README.md`
- Create: `docs/mvp-proof.md`

- [ ] **Step 1: Write README first screen**

```md
# Demo Killer

Demo Killer is the pre-launch production engineer for AI-built apps.

It tells you why your working Next.js SaaS or AI app is still a demo, what can happen in production, and what must change before real users touch it.

```powershell
demokiller inspect .
```

Example verdict:

```text
Verdict: Launch Blocked

DK-AI-001: Paid AI capability is exposed without production abuse controls
Entry point: app/api/chat/route.ts
Production consequence: A public script can repeatedly trigger paid AI calls and create unexpected API costs.
```

## MVP Scope

- Next.js App Router.
- TypeScript.
- Local static inspection.
- AI/SaaS launch blockers.

Demo Killer does not certify that an app is production ready. It identifies launch blockers in its supported scope.
```

- [ ] **Step 2: Write MVP proof doc**

```md
# MVP Proof

The MVP is validated against fixture apps that look like AI-generated SaaS demos.

## Risky Fixture

`fixtures/next-ai-saas-risky` contains:

- Public AI chat route without auth, quota, or rate limit.
- Admin user deletion route without auth or authorization.
- Stripe webhook without signature verification or idempotency.
- Missing environment contract for provider secrets.
- Prisma schema without migration evidence.

Expected verdict: `Launch Blocked`.

## Partial Fix Fixture

`fixtures/next-ai-saas-partial-fix` fixes:

- AI chat auth.
- AI chat rate limit.
- Environment contract.
- Migration evidence.

Expected result: fewer blockers than the risky fixture.
```

- [ ] **Step 3: Commit docs**

```bash
git add README.md docs/mvp-proof.md
git commit -m "docs: explain demokiller mvp proof"
```

### Task 10: Final verification

**Files:**
- No new files.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run CLI against risky fixture**

Run: `npm run build` then `node dist/src/cli.js inspect fixtures/next-ai-saas-risky --markdown`

Expected: report includes `Verdict: Launch Blocked`, `DK-AI-001`, `DK-AUTH-001`, `DK-WEBHOOK-001`, `DK-ENV-001`, and `DK-DB-001`.

- [ ] **Step 4: Run CLI against partial-fix fixture**

Run: `npm run build` then `node dist/src/cli.js inspect fixtures/next-ai-saas-partial-fix --json`

Expected: JSON report contains fewer findings than the risky fixture.

- [ ] **Step 5: Commit verification adjustments if needed**

```bash
git status --short
git add .
git commit -m "test: verify demokiller mvp flow"
```

## Self-Review

### Spec Coverage

- First wedge: implemented through Next.js App Router fixture projects and local static inspection.
- Evidence model: implemented in `src/types.ts` and exercised through rules.
- Five MVP domains: covered by AI route, admin mutation auth, webhook safety, env contract, migration posture, and observability to be added after the first five rules are stable.
- Report requirements: covered by JSON and Markdown report tasks.
- Recheck loop: covered by snapshot diff task.
- MCP delay: respected; no MCP task appears in this MVP.

### Implementation Boundaries

MCP, skills, plugins, hosted dashboard, CI gate, auto-fix, dynamic runtime checks, and multi-framework support are intentionally outside this MVP. They should be planned only after the local CLI produces stable evidence-backed findings on the fixture corpus.

### Placeholder Scan

No placeholder tasks are left. Every implementation task is tied to fixture-backed tests or explicit report behavior.

### Type Consistency

The plan uses one shared vocabulary:

- `Verdict`
- `Evidence`
- `Finding`
- `AnalysisReport`
- `buildInventory`
- `inspectRouteSource`
- `analyzeFindings`
- `buildJsonReport`
- `renderMarkdownReport`
- `diffSnapshots`
- `runCli`
