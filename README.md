# Demo Killer

Demo Killer is the pre-launch production engineer for AI-built apps.

It tells you why your working Next.js SaaS or AI app is still a demo, what can happen in production, and what must change before real users touch it.

## Usage

```powershell
npm install
npm run build
node dist/src/cli.js inspect fixtures/next-ai-saas-risky --markdown
```

You can also inspect a public GitHub repository URL:

```powershell
node dist/src/cli.js inspect https://github.com/owner/repo --json
```

## Benchmark

Demo Killer can run an on-demand public benchmark set:

```powershell
npm run benchmark
```

The benchmark is archetype-aware. Samples are labeled by project shape, such as `ai-saas` or `payment-starter`, so Demo Killer does not collapse into a single SaaS-only scanner.

Each sample is reported as:

- `match` when the verdict and rule ids match the stored expectation.
- `mismatch` when the project analyzes but the outcome differs from the benchmark expectation.
- `error` when the repository cannot be cloned or inspected.

Example verdict:

```text
Verdict: Launch Blocked

DK-AI-001: Paid AI capability is exposed without production abuse controls
Entry point: app/api/chat/route.ts
Production consequence: A public script can repeatedly trigger paid AI calls and create unexpected API costs.
```

## MVP Scope

The first MVP is deliberately narrow:

- Next.js App Router.
- TypeScript.
- Local static inspection.
- AI/SaaS-style applications.
- Local path or public GitHub repository input.

Demo Killer does not certify that an app is production ready. It identifies launch blockers in its supported scope.

## Core Direction

- Diagnose why AI-built apps are still demos.
- Produce evidence-backed launch blockers.
- Explain real production consequences.
- Generate a phased hardening path.
- Recheck progress after fixes.

## Documents

- Product design: `docs/superpowers/specs/2026-06-17-demo-killer-product-design.md`
- MVP implementation plan: `docs/superpowers/plans/2026-06-17-demo-killer-mvp-plan.md`
- MVP proof: `docs/mvp-proof.md`
