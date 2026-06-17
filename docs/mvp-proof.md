# MVP Proof

The MVP is validated against fixture apps that look like AI-generated SaaS demos.

The fixture layer exists so tests are deterministic and do not depend on mutable external GitHub repositories. The benchmark manifest exists so Demo Killer can also be demonstrated against real public projects.

## Risky Fixture

`fixtures/next-ai-saas-risky` contains:

- Public AI chat route without auth, quota, or rate limit.
- Admin user deletion route without auth or authorization.
- Stripe webhook without signature verification or idempotency.
- Missing environment contract for provider secrets.
- Prisma schema without migration evidence.
- Critical data mutation route without diagnostic logging.

Expected verdict: `Launch Blocked`.

Expected findings:

- `DK-AI-001`
- `DK-AUTH-001`
- `DK-WEBHOOK-001`
- `DK-OBS-001`
- `DK-ENV-001`
- `DK-DB-001`

## Partial Fix Fixture

`fixtures/next-ai-saas-partial-fix` fixes:

- AI chat auth.
- AI chat rate limit.
- Admin auth and authorization.
- Environment contract.
- Migration evidence.

Expected result: fewer findings than the risky fixture.

Remaining expected findings:

- `DK-AI-001` for missing quota.
- `DK-WEBHOOK-001` for webhook safety.
- `DK-OBS-001` for missing mutation-path diagnostics.

## Public Benchmarks

`benchmarks/github-projects.json` lists real public GitHub repositories that can be used for manual proof and future regression benchmarking.

Each public sample includes:

- `archetype` - the project shape, such as `ai-saas` or `payment-starter`.
- `riskProfile` - the production risk surfaces the sample represents.
- `expectedVerdict` - the stored benchmark verdict.
- `expectedRuleIds` - the rules expected to appear for that sample.

This keeps the benchmark tied to the general Demo Killer thesis: the product kills productionization illusions across project archetypes, not only SaaS demos.

These are intentionally not part of the default test suite because public repositories can change, disappear, or fail to clone due to network conditions.

Run the public benchmark on demand:

```powershell
npm run build
npm run benchmark
```
