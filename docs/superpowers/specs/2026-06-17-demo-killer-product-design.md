# Demo Killer Product Design

## One-Line Positioning

Demo Killer is the pre-launch production engineer for AI-built apps: it tells users why their working product is still a demo, what production consequences they are exposed to, and what must change before real users touch it.

## Product Thesis

AI coding tools make feature-complete demos easy. They do not automatically produce production-grade systems.

The core failure is not that users refuse engineering rigor. The core failure is that both users and AI agents often do not know what production readiness requires. They see working screens, working APIs, working auth, working payments, and working AI calls. They miss the production gaps that only show up when real users, real attackers, real data, real money, real deployment failure, and real maintenance arrive.

Demo Killer exists to expose that gap before launch.

It should not behave like a passive assistant or a generic scanner. It should give an opinionated verdict backed by evidence:

> This is still a demo. Here is why. Here is what can happen in production. Here is what must change first.

## What Demo Killer Is

Demo Killer is a productionization system for AI-built applications.

It is composed of:

- A local evidence engine.
- A production gap rule engine.
- A CLI.
- Human-readable and machine-readable reports.
- A recheck loop that shows whether production blockers were actually reduced.
- Later: MCP, agent skills, plugins, CI gates, and dashboards.

The core product is not the CLI, MCP, plugin, or dashboard. Those are distribution forms.

The core product is production judgment:

> Given a project, identify why it is still not ready for real users, using concrete evidence and production consequences.

## What Demo Killer Is Not

Demo Killer is not:

- A generic code quality scanner.
- A SAST replacement.
- A dependency vulnerability scanner.
- A compliance auditor.
- A generic AI coding agent.
- A checklist app.
- A one-click production hardening tool.
- A certification system that guarantees safety.

These tools may overlap with parts of Demo Killer, but Demo Killer should not compete on their terms.

## First Wedge

The first wedge is deliberately narrow:

**AI-generated Next.js SaaS and AI apps before launch.**

This is the right wedge because:

- Next.js/TypeScript is common in AI-generated projects.
- SaaS and AI apps often touch auth, data, payments, paid APIs, uploads, and external services.
- Users in this segment frequently ship from vibe-coded demos to real deployments.
- Production gaps are concrete enough to detect with local static evidence.
- The findings can produce strong emotional proof: "I thought this was ready, but it clearly is not."

The first version should not attempt to support every framework, every language, every deployment environment, or every production standard.

## Target Users

Primary users:

- Independent developers building with Codex, Claude Code, Cursor, v0, Bolt, Lovable, Replit, and similar tools.
- Small teams or founders preparing an AI-built app for launch.
- Developers who can build working features but lack full production engineering experience.

Secondary users later:

- AI coding agents that need a production engineering review framework.
- Teams that want a pre-launch gate in CI.
- Agencies or consultants reviewing AI-built client projects.

The first product should speak to the individual builder who asks:

> I built this with AI. Can I actually launch it?

## Core Workflow

The intended workflow is:

1. User runs Demo Killer locally before launch.
2. Demo Killer inventories the project.
3. Demo Killer extracts production-relevant evidence.
4. Demo Killer applies evidence-first production gap rules.
5. Demo Killer outputs a verdict, launch blockers, production consequences, and a phased hardening plan.
6. User or an AI coding agent fixes the first phase.
7. User runs Demo Killer again.
8. Demo Killer shows which blockers remain, which disappeared, and whether the project has moved from demo toward production candidate.

## Verdict Model

The first version must not output `Production Ready`.

That claim is too broad without runtime validation, deployment validation, human product review, load testing, incident response validation, and security review.

Use these states instead:

- `Demo`: the project has launch-blocking production gaps.
- `Launch Blocked`: a specific blocker prevents responsible launch.
- `Production Candidate`: no known launch blockers were found in the supported scope, but this is not a guarantee.
- `Insufficient Evidence`: Demo Killer cannot make a confident judgment because required evidence is missing.

This protects product credibility. Demo Killer can help a project move toward production, but it should not over-certify.

## Evidence Model

Every serious finding must be evidence-backed.

The core evidence chain is:

```text
Entry Point -> Capability -> Asset -> Missing or Weak Control -> Production Consequence
```

Definitions:

- Entry point: something reachable or triggered from outside the trusted core, such as an API route, server action, webhook, callback, upload endpoint, cron handler, admin route, or public page action.
- Capability: what that entry point can do, such as mutate data, call a paid AI API, send email, process payment, upload files, generate signed URLs, change permissions, or delete records.
- Asset: what can be harmed or consumed, such as user data, money, API quota, secrets, files, admin operations, or business workflows.
- Control: production protection such as auth, authorization, validation, rate limit, quota, idempotency, signature verification, logging, alerting, migration, backup, rollback, or health check.
- Consequence: what can realistically happen in production, described in user-facing terms.

Each launch blocker should include:

- Rule id.
- Severity.
- Confidence.
- File path.
- Line or location when available.
- Entry point.
- Capability.
- Asset.
- Missing or weak control.
- Production consequence.
- Fix acceptance criteria.
- Detector name.

No evidence means no launch blocker. A low-confidence observation can be advisory, but not blocking.

## MVP Risk Domains

The first version should focus on five high-signal domains:

1. Public API and authorization boundaries.
2. Paid AI or third-party capability exposure.
3. Environment, secrets, and deployment reproducibility.
4. Database migrations, rollback posture, and data mutation safety.
5. Logging and failure diagnosis for critical paths.

These are broad enough to feel like production readiness, but narrow enough to implement credibly.

The first version should not attempt to deeply solve:

- Full compliance.
- Full security audit.
- Load testing.
- Multi-cloud deployment validation.
- Enterprise policy enforcement.
- All observability best practices.
- All framework ecosystems.

## Product Shape Roadmap

### Phase 1: Trustworthy Local CLI

Build a local CLI that can inspect real or fixture Next.js projects and output JSON plus Markdown reports.

Commands:

```powershell
demokiller inspect
demokiller inspect --json
demokiller inspect --markdown
demokiller recheck
```

Phase 1 must prioritize diagnosis quality over integrations.

### Phase 2: Agent-Native Interfaces

After the CLI produces stable evidence-backed reports, expose the same engine through MCP.

MCP tools should be thin wrappers over the core engine:

- `inspect_project`
- `list_launch_blockers`
- `explain_finding`
- `generate_hardening_plan`
- `recheck_project`

MCP must not contain separate judgment logic.

### Phase 3: Skills and Plugins

Package the workflow for Codex, Claude Code, Cursor, and similar tools:

- Inspect.
- Explain blockers.
- Create hardening plan.
- Execute a phase.
- Recheck.

Skills and plugins are distribution and workflow layers, not the source of truth.

### Phase 4: CI and Team Workflows

Add GitHub Actions or CI gates after the local engine is trusted.

CI should initially warn or comment rather than block by default.

## MVP Validation Strategy

The MVP must be sample-driven.

Before building general scanning, create a fixture corpus of AI-style Next.js demos. Each sample must have expected findings.

Required samples:

1. Public AI chat route that calls a paid provider without auth, quota, or rate limit.
2. Admin data mutation route with weak or missing authorization.
3. Stripe or payment webhook without signature verification or idempotency.
4. App that uses required production env vars but has no env contract.
5. App with database schema changes but no migration or rollback signal.
6. App with a critical mutation path and no logging or failure diagnosis signal.

The product is credible only if it detects non-obvious production blockers in these samples with concrete evidence.

## Report Requirements

A report must not be a vague scorecard.

It must include:

- Verdict.
- Supported scope.
- Launch blockers.
- Advisory findings.
- Evidence for each blocker.
- Production consequence for each blocker.
- Fix acceptance criteria.
- Suggested hardening phases.
- Recheck summary when previous state exists.

Example finding shape:

```text
Rule: DK-AI-001
Severity: blocker
Confidence: high
Entry point: app/api/chat/route.ts
Capability: Calls OpenAI chat completion
Asset: Paid AI API quota
Missing controls: user-bound quota, rate limit, abuse logging
Consequence: A public script can repeatedly trigger paid AI calls and create unexpected API costs.
Acceptance criteria:
- Requests require an authenticated user or trusted server-side session.
- Usage is bound to a user or tenant.
- Per-user or per-IP quota exists.
- Abnormal usage is logged.
```

## Competitive Position

Existing tools often answer:

> What looks risky?

Demo Killer should answer:

> Why is this still a demo, what production consequence can happen, and what must change before launch?

The defensible difference is not MCP, CLI, or plugin support. Those are expected in agent-native tooling.

The defensible difference is:

- Evidence-backed production judgment.
- Production consequence language.
- Demo-to-production state movement.
- Recheck loop.
- Agent-readable hardening plan.

## Go-To-Market Proof

The first public proof should be a before-and-after demo:

1. Generate or collect a realistic AI-built Next.js SaaS demo.
2. Run Demo Killer.
3. Show five launch blockers with file evidence.
4. Fix two blockers.
5. Run recheck.
6. Show the project moving from `Demo` to a less blocked state.

The README should lead with a real verdict, not a feature list.

Example:

> This app can burn your OpenAI credits from a public route.

Then show the evidence and fix criteria.

## Design Guardrails

To avoid becoming a demo itself:

- Do not claim full production readiness.
- Do not produce launch blockers without evidence.
- Do not lead with dashboards.
- Do not prioritize MCP before CLI trustworthiness.
- Do not add broad framework support before the first wedge works.
- Do not let LLMs be the sole judge.
- Do not optimize for pretty reports before findings are specific and reproducible.

## Success Criteria

The first version succeeds when:

- It analyzes fixture and real AI-style Next.js apps.
- It detects meaningful blockers in the five MVP domains.
- Each blocker includes concrete evidence and production consequence.
- The report gives a phased hardening plan.
- Recheck shows blocker changes after fixes.
- A skeptical developer can understand why a blocker was produced.

## Open Decisions

- Use TypeScript compiler API directly or `ts-morph` for source inspection.
- Exact severity and confidence scale.
- Whether to include `Launch Blocked` as a separate verdict or represent it as `Demo` plus blockers.
- Whether initial fixture samples live inside the repo or in a separate benchmark repo later.
- Which hosting assumptions, if any, should be made in the first version.
