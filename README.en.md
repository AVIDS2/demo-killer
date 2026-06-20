# Demo Killer

[简体中文](README.md) · [npm](https://www.npmjs.com/package/demokiller) · [GitHub](https://github.com/AVIDS2/demokiller)

Kill your demo and turn it into a truly production-deliverable system.

Demo Killer is a pre-launch production gate for AI-built apps. It tells you why a working project is still a demo, what can go wrong in production, and what must change before real users touch it.

It is not a generic scanner or a fake "production ready" certificate. Think of it as a local production engineer before launch:

- Finds launch blockers instead of giving a vague score.
- Explains findings with file evidence.
- Describes real production consequences.
- Produces a phased hardening plan.
- Gives AI coding agents a concrete production gate.

## Why It Exists

AI coding tools make working demos easy. A page loads, an API responds, a payment webhook runs, an AI route returns content, and the database writes data.

But working is not the same as production-deliverable.

Real production introduces risks most demos never face:

- Public API routes can be scripted until they burn paid AI or provider quota.
- Admin mutation endpoints can change user data without a real access boundary.
- Webhooks can be forged or replayed without signature verification and idempotency.
- Deployments fail because required environment variables are not documented.
- Database schemas exist without migrations.
- Critical mutations fail with no diagnostic trail.

Demo Killer exists to kill those production illusions before launch.

## Quick Start

No global install required:

```powershell
npx demokiller --help
npx demokiller init .
npx demokiller inspect . --markdown
```

`init` wires Demo Killer into your agent workflow:

```text
.demokiller/AGENT.md
AGENTS.md
```

After that, agents such as Codex, Claude Code, Cursor, Gemini CLI, and other coding agents can see that Demo Killer is the pre-launch production gate. A `Launch Blocked` verdict should stop release, deployment, or handoff work.

## Example Output

```text
Verdict: Launch Blocked

DK-AI-001: Paid AI capability is exposed without production abuse controls
Entry point: app/api/chat/route.ts
Production consequence: A public script can repeatedly trigger paid AI calls and create unexpected API costs.

Acceptance criteria:
- Requests require an authenticated user or trusted server-side session.
- Usage is bound to a user or tenant.
- Per-user or per-IP quota exists.
- Abnormal usage is logged.
```

Demo Killer does not just say "this looks risky." It builds a production evidence chain:

```text
Entry point -> Capability -> Asset -> Missing control -> Production consequence -> Acceptance criteria
```

That is what separates it from generic linters, SAST tools, dependency scanners, and checklist apps.

## Commands

| Command | Purpose |
| --- | --- |
| `npx demokiller init .` | Add agent-facing production gate guidance |
| `npx demokiller inspect . --markdown` | Inspect the current project and print a human report |
| `npx demokiller inspect . --json` | Print agent/CI-readable JSON |
| `npx demokiller inspect https://github.com/owner/repo --markdown` | Inspect a public GitHub repository |
| `demokiller benchmark <manifest-path>` | Run a benchmark manifest |

Global install is also supported:

```powershell
npm install -g demokiller
demokiller inspect . --markdown
```

## Current Rules

The first release focuses on high-signal production gaps in AI-built apps:

| Rule | Detects |
| --- | --- |
| `DK-AI-001` | Public paid AI capability without auth, quota, rate limiting, or abuse logging |
| `DK-AUTH-001` | Admin/data mutation routes without authentication and authorization |
| `DK-WEBHOOK-001` | Payment webhooks without signature verification and idempotency |
| `DK-ENV-001` | Missing production environment contract |
| `DK-DB-001` | Prisma schema without migration evidence |
| `DK-OBS-001` | Critical mutation path without diagnostic logging |

## Supported Scope

The current version is intentionally narrow:

- Next.js App Router
- TypeScript
- Local static inspection
- AI/SaaS-style applications
- Local paths or public GitHub repositories

If Demo Killer cannot collect enough supported evidence, it returns `Insufficient Evidence` instead of pretending the project is safe.

## Verdicts

Demo Killer does not output `Production Ready`.

That claim requires runtime validation, deployment validation, load testing, security review, backup and recovery checks, monitoring, product review, and operational readiness.

Current verdicts:

| Verdict | Meaning |
| --- | --- |
| `Launch Blocked` | A concrete blocker prevents responsible launch |
| `Demo` | Production gaps exist, but may not all be launch blockers |
| `Production Candidate` | No known blocker was found in the supported scope; not a guarantee |
| `Insufficient Evidence` | Demo Killer cannot make a credible judgment |

## Agent Workflow

Recommended workflow before release or production handoff:

```powershell
npx demokiller init .
npx demokiller inspect . --markdown
```

Then have your agent:

1. Read `Launch Blocked` findings first.
2. Fix Phase 0 blockers before polish work.
3. Re-run `demokiller inspect . --markdown` after each hardening pass.
4. Avoid claiming production readiness from UI polish, refactors, or green local demos.
5. Move to deployment, load testing, security review, and human review only after blockers are gone.

The core product shape is simple: Demo Killer does not write your app for you; it tells your agent what is still not production-deliverable.

## Benchmark

Demo Killer includes a public GitHub benchmark set so the product does not collapse into a single fixture demo. From a source checkout, run:

```powershell
npm run benchmark
```

The benchmark reports:

- Total samples
- Archetype coverage
- Expected vs actual verdicts
- Expected vs actual rule ids
- Clone or analysis errors

Current sample archetypes include `ai-saas`, `payment-starter`, `api-backend`, `admin-panel`, `automation-worker`, `agent-app`, and `content-site`.

## Local Development

```powershell
git clone https://github.com/AVIDS2/demokiller.git
cd demokiller
npm install
npm test
npm run typecheck
npm run build
node dist/src/cli.js inspect fixtures/next-ai-saas-risky --markdown
```

Pre-publish checks:

```powershell
npm test
npm run typecheck
npm run build
npm audit --json
npm pack --dry-run
```

## Roadmap

- CLI: local inspection, GitHub URL inspection, Markdown/JSON reports.
- Agent guidance: `demokiller init` writes an agent-facing production contract.
- MCP: expose `inspect_project`, `list_launch_blockers`, and `generate_hardening_plan`.
- Skills/plugins: integrate with Codex, Claude Code, Cursor, and similar tools.
- CI: GitHub Actions and PR comments for pre-launch gates.
- Broader scope: more frameworks, more production risk domains, more benchmark samples.

## Principles

- No blocker without evidence.
- No false "production ready" claims.
- No dashboard before judgment quality.
- No fake broad framework support.
- No LLM-only judgment.
- No confusing "it runs" with "it can be delivered."

## License

MIT
