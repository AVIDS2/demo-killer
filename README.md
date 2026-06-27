<p align="center">
  <img src="assets/demokiller-banner.svg" alt="Demo Killer" width="720">
</p>

<h1 align="center">Demo Killer</h1>

<p align="center">
  <strong>AI builds demos. Demo Killer makes them production-ready.</strong><br>
  The production gate that kills AI-generated demos before they ship. 155 rules. 26 project types. One command.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/demokiller"><img src="https://img.shields.io/npm/v/demokiller.svg?style=for-the-badge&logo=npm&color=cb3837" alt="npm"></a>
  <a href="https://www.npmjs.com/package/demokiller"><img src="https://img.shields.io/npm/dm/demokiller.svg?style=for-the-badge&logo=npm&color=7c3aed" alt="downloads"></a>
  <a href="https://github.com/AVIDS2/demokiller/actions"><img src="https://img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml?style=for-the-badge&label=CI&logo=github" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2563eb?style=for-the-badge" alt="license"></a>
  <a href="https://github.com/AVIDS2/demokiller"><img src="https://img.shields.io/github/stars/AVIDS2/demokiller?style=for-the-badge&logo=github&color=facc15" alt="stars"></a>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#what-it-checks">What It Checks</a> |
  <a href="#for-agents--ci">For Agents</a> |
  <a href="#project-types">Project Types</a> |
  <a href="https://github.com/AVIDS2/demokiller/wiki">Docs</a>
</p>

---

## The problem

Your AI assistant built you an app in 30 minutes. It runs locally. It looks right.

But can it actually ship?

- API keys hardcoded in source code
- No input validation on any endpoint
- Webhook signatures never verified
- Admin routes open to anyone
- CORS wide open, no CSP, no HTTPS redirect
- Zero tests, zero error handling

Your linter says 87/100. Demo Killer says **Launch Blocked**.

---

## One command

```bash
npx demokiller inspect . --markdown
```

That's it. No install. No config. Point it at any project and get a hard verdict.

```
verdict: Launch Blocked

  DK-AI-001  blocker  Hardcoded API key detected
    file:    src/lib/openai.ts
    why:     API key exposed in source code, visible to anyone with repo access
    fix:     Move key to environment variable, add .env to .gitignore

  DK-CORS-001  high  CORS allows all origins
    file:    src/server.ts
    why:     Any website can make authenticated requests to your API
    fix:     Restrict origins to your actual domain

  DK-AUTH-001  high  No authentication on admin route
    file:    src/routes/admin.ts
    why:     /admin/users is accessible without any auth check
    fix:     Add auth middleware before route handler
```

Each finding tells you **what**, **where**, **why it matters**, and **exactly how to fix it**.

---

## What it checks

Demo Killer doesn't just lint — it runs a **production readiness audit** across your entire codebase.

| Check | What it finds |
|-------|---------------|
| **Security** | Hardcoded secrets, SQL injection, XSS, SSRF, command injection, path traversal |
| **Authentication** | Missing auth on routes, weak session config, unsigned webhooks |
| **Input Validation** | Unsanitized request body, missing parameter checks, no type safety |
| **Error Handling** | Swallowed exceptions, missing try/catch, exposed stack traces |
| **Observability** | No logging, no health checks, no graceful shutdown |
| **Performance** | N+1 queries, missing timeouts, no connection pooling |
| **Agent Safety** | Prompt injection, unchecked tool execution, context leaks, LLM eval |
| **Business Logic** | Missing idempotency on payments, no transaction safety, race conditions |
| **TypeScript** | Strict mode disabled, missing type declarations |
| **Testing** | Zero test files, no CI, no coverage |
| **Dependencies** | Known vulnerabilities, unused packages, missing lockfile |
| **Deployment** | Missing Docker health check, no graceful shutdown, no env contract |

Demo Killer also runs **26 project-type-specific rule sets** — a Python API gets different checks than a blockchain contract or a CLI tool.

---

## How results work

| Verdict | Meaning |
|---------|---------|
| **Launch Blocked** | Has blocker findings. Do not ship. |
| **Hardening Required** | Has high-severity findings. Ship with risk acceptance. |
| **Minor Issues** | Has medium findings. Ship, but track them. |
| **Production Ready** | No significant findings. Good to go. |

Every finding includes:
- **File and line** — where the problem is
- **Severity** — blocker / high / medium / advisory
- **Consequence** — what happens in production if you ignore this
- **Acceptance criteria** — exactly what "fixed" looks like
- **Controls** — what's missing (e.g., "add rate limiting", "verify webhook signature")

---

## Quick Start

```bash
# Install globally
npm install -g demokiller

# Inspect any project
demokiller inspect .

# Output as markdown (great for PRs)
demokiller inspect . --format markdown

# Output as SARIF (GitHub Code Scanning)
demokiller inspect . --format sarif > results.sarif

# Only show blockers
demokiller inspect . --severity blocker

# Save baseline, then diff on next run
demokiller inspect . --save-baseline .dk-baseline.json
demokiller recheck .   # shows only new findings since baseline

# Scaffold agent integration files
demokiller init .
```

Or skip install entirely:

```bash
npx demokiller inspect . --markdown
```

---

## For Agents & CI

Demo Killer is **agent-native**. It speaks MCP, outputs structured JSON, and writes agent guidance files.

### Claude Code

```jsonc
// .claude/settings.json
{
  "mcpServers": {
    "demokiller": {
      "command": "npx",
      "args": ["demokiller-mcp"]
    }
  }
}
```

Then ask Claude: *"Run a Demo Killer inspection and fix all blockers."*

### Cursor / Windsurf / Claude Desktop

```jsonc
{
  "mcpServers": {
    "demokiller": {
      "command": "npx",
      "args": ["demokiller-mcp"]
    }
  }
}
```

### GitHub Actions

```yaml
- name: Production Gate
  run: npx demokiller inspect . --format sarif > results.sarif

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### Agent Skill

After `demokiller init .`, any agent with skill support gets a `/demokiller` command that auto-triggers on production-readiness checks. The skill reads the verdict, prioritizes blockers, and generates an actionable fix plan.

---

## Project types

Demo Killer detects **26 project types** and applies type-specific rules for each one.

<table>
<tr>
<td align="center" width="12.5%">
<strong>Web App</strong><br>
<sub>Next.js, React, Vue, Express, FastAPI, Django, Gin, Spring Boot</sub>
</td>
<td align="center" width="12.5%">
<strong>CLI Tool</strong><br>
<sub>Commander, Yargs, Oclif, Click, Cobra</sub>
</td>
<td align="center" width="12.5%">
<strong>Library / SDK</strong><br>
<sub>npm package, Python package, Go module</sub>
</td>
<td align="center" width="12.5%">
<strong>Python API</strong><br>
<sub>FastAPI, Flask, Django, Litestar</sub>
</td>
<td align="center" width="12.5%">
<strong>Desktop App</strong><br>
<sub>Electron, Tauri</sub>
</td>
<td align="center" width="12.5%">
<strong>Mobile App</strong><br>
<sub>React Native, Flutter, Capacitor</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<strong>Game</strong><br>
<sub>Phaser, Pixi, Three.js, Godot, Unity</sub>
</td>
<td align="center" width="12.5%">
<strong>ML Pipeline</strong><br>
<sub>PyTorch, TensorFlow, Pandas, Scikit</sub>
</td>
<td align="center" width="12.5%">
<strong>Agent / MCP</strong><br>
<sub>LLM agents, tool use, MCP servers</sub>
</td>
<td align="center" width="12.5%">
<strong>API Gateway</strong><br>
<sub>Kong, Express Gateway, http-proxy</sub>
</td>
<td align="center" width="12.5%">
<strong>Browser Extension</strong><br>
<sub>Chrome, Firefox, Manifest V3</sub>
</td>
<td align="center" width="12.5%">
<strong>IDE Plugin</strong><br>
<sub>VS Code extensions</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<strong>CI/CD Pipeline</strong><br>
<sub>GitHub Actions, GitLab CI, Jenkins</sub>
</td>
<td align="center" width="12.5%">
<strong>Migration Tool</strong><br>
<sub>Knex, Prisma, TypeORM, Alembic</sub>
</td>
<td align="center" width="12.5%">
<strong>Cron Job</strong><br>
<sub>node-cron, Celery, APScheduler</sub>
</td>
<td align="center" width="12.5%">
<strong>Serverless</strong><br>
<sub>AWS Lambda, Vercel, Cloudflare</sub>
</td>
<td align="center" width="12.5%">
<strong>MQ Worker</strong><br>
<sub>Kafka, RabbitMQ, BullMQ, SQS</sub>
</td>
<td align="center" width="12.5%">
<strong>IaC</strong><br>
<sub>Terraform, Pulumi, CDK, CloudFormation</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<strong>WASM Module</strong><br>
<sub>wasm-pack, AssemblyScript</sub>
</td>
<td align="center" width="12.5%">
<strong>Blockchain</strong><br>
<sub>Solidity, ethers.js, web3.js</sub>
</td>
<td align="center" width="12.5%">
<strong>IoT / Embedded</strong><br>
<sub>PlatformIO, Johnny-Five, Arduino</sub>
</td>
<td align="center" width="12.5%">
<strong>DevOps Script</strong><br>
<sub>Shell scripts, zx, deployment automation</sub>
</td>
<td align="center" width="12.5%">
<strong>Static Site</strong><br>
<sub>Astro, Hugo, Gatsby, Eleventy</sub>
</td>
<td align="center" width="12.5%">
<strong>CMS</strong><br>
<sub>Strapi, Directus, Keystone, Payload</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<strong>Monitoring</strong><br>
<sub>Prometheus, Grafana, StatsD, Datadog</sub>
</td>
<td align="center" width="12.5%">
<strong>Payment System</strong><br>
<sub>Stripe, PayPal, Square</sub>
</td>
<td align="center" width="12.5%">
<strong>Auth Service</strong><br>
<sub>Passport, NextAuth, Clerk, Auth.js</sub>
</td>
<td align="center" width="12.5%">
</td>
</tr>
</table>

<p align="center">
  <sub>Each type gets 3-6 dedicated deep rules on top of the universal security and quality checks.</sub>
</p>

---

## Languages

Demo Killer analyzes **18 languages** with language-aware parsing.

| Language | Detection | AST (tree-sitter) | Call Graph | Taint Analysis |
|----------|-----------|-------------------|------------|----------------|
| TypeScript | ✅ | ✅ | ✅ | ✅ |
| JavaScript | ✅ | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | ✅ (AST) | ✅ (BFS) |
| Go | ✅ | ✅ | regex | taint sinks |
| Rust | ✅ | ✅ | regex | taint sinks |
| Java | ✅ | ✅ | regex | partial |
| C# | ✅ | ✅ | regex | — |
| PHP | ✅ | ✅ | — | — |
| Ruby | ✅ | ✅ | — | — |
| Swift | ✅ | ✅ | — | — |
| Kotlin | ✅ | ✅ | — | — |
| Scala | ✅ | ✅ | — | — |
| Dart | ✅ | ✅ | — | — |
| C / C++ | ✅ | ✅ | — | — |
| Shell | ✅ | ✅ | — | — |
| Lua | ✅ | ✅ | — | — |
| Zig | ✅ | ✅ | — | — |
| Vue | ✅ | ✅ | — | — |

---

## CLI commands

| Command | Purpose |
|---------|---------|
| `demokiller inspect .` | Full production readiness audit |
| `demokiller inspect . --format markdown` | Markdown output for PRs and docs |
| `demokiller inspect . --format sarif` | SARIF for GitHub Code Scanning |
| `demokiller inspect . --severity blocker` | Only show launch blockers |
| `demokiller inspect . --save-baseline .dk.json` | Save current state as baseline |
| `demokiller recheck .` | Diff against baseline (new findings only) |
| `demokiller init .` | Scaffold agent integration files |
| `demokiller benchmark benchmarks/list.json` | Run benchmark suite |

---

## MCP Server

Demo Killer runs as an MCP server with 3 tools for agents:

| Tool | What it does |
|------|--------------|
| `inspect_project` | Full audit with JSON or markdown output |
| `list_launch_blockers` | Returns only blocker-severity findings |
| `generate_hardening_plan` | 3-phase fix plan: blockers → hardening → improvements |

Start the server:

```bash
npx demokiller-mcp
```

---

## Agent Skill

After `demokiller init .`, agents with skill support get:

- **`/demokiller` command** — run inspection, parse verdict, generate fix plan
- **Auto-trigger** — skill activates on production-readiness context
- **Blocker prioritization** — agent focuses on blockers first, then high, then medium

---

## vs. other tools

| | CodeQL | SonarQube | Semgrep | Snyk | **Demo Killer** |
|---|---|---|---|---|---|
| **Purpose** | Find vulns | Find code smells | Find patterns | Find dep vulns | **Find launch blockers** |
| **Output** | "47 medium issues" | "D-rating" | "12 findings" | "3 high vulns" | **"Launch Blocked"** |
| **Project types** | Generic | Generic | Generic | Generic | **26 types, type-specific rules** |
| **Agent-native** | ❌ | ❌ | ❌ | ❌ | **✅ MCP, Skills, JSON, SARIF** |
| **Verdict** | No | Score | No | No | **4-level verdict** |
| **Consequence** | No | No | No | No | **"Here's what happens if you ignore this"** |
| **Acceptance criteria** | No | No | No | No | **"Here's what 'fixed' looks like"** |

CodeQL tells you what's wrong with your code. **Demo Killer tells you whether your project can go live.**

---

## Roadmap

- Systematic false-positive measurement on 100+ real-world projects
- Per-file analysis replacing content concatenation (reduces cross-file false positives)
- Java, C#, PHP, Ruby call graph support (currently regex-only)
- Plugin API for custom rules
- VS Code extension

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, adding rules, and testing.

---

## License

[MIT](LICENSE) — use it however you want.

<p align="center">
  <sub>Built for developers who ship, not developers who demo.</sub>
</p>
