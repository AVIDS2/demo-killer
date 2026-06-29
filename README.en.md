# Demo Killer

<p align="center">
  <img src="assets/demokiller-banner.svg" alt="Demo Killer" width="720">
</p>

<p align="center">
  <strong>AI builds demos. Demo Killer kills demo illusions.</strong><br>
  Open-source production readiness gate for AI-generated projects — 155 rules, 26 project types, 18 languages, one command.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/demokiller"><img src="https://img.shields.io/npm/v/demokiller.svg?style=for-the-badge&logo=npm&color=cb3837" alt="npm"></a>
  <a href="https://www.npmjs.com/package/demokiller"><img src="https://img.shields.io/npm/dm/demokiller.svg?style=for-the-badge&logo=npm&color=7c3aed" alt="downloads"></a>
  <a href="https://github.com/AVIDS2/demokiller/actions"><img src="https://img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml?style=for-the-badge&label=CI&logo=github" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2563eb?style=for-the-badge" alt="license"></a>
  <a href="https://github.com/AVIDS2/demokiller"><img src="https://img.shields.io/github/stars/AVIDS2/demokiller?style=for-the-badge&logo=github&color=facc15" alt="stars"></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#what-it-checks">What It Checks</a> |
  <a href="#for-agents">For Agents</a> |
  <a href="#supported-project-types">Project Types</a> |
  <a href="#supported-languages">Languages</a>
</p>

---

## The Problem

You've spent months building your project. AI tools helped you move fast. Features work. Tests pass. You're ready to deploy.

But you know: production is unforgiving.

- API keys hardcoded in source code
- No input validation on any endpoint
- Webhook signatures never verified
- Admin routes open to everyone
- CORS wide open, no CSP, no HTTPS redirect
- Zero tests, zero error handling

Your linter gave it 87/100. Demo Killer gives you: **Launch Blocked**.

---

## One Command

```bash
npx demokiller inspect . --markdown
```

No install, no config. Point at any project, get a verdict.

```
verdict: Launch Blocked

  DK-AI-001  blocker  Hardcoded API key detected
    File:    src/lib/openai.ts
    Impact:  API key exposed in source — anyone with repo access can see it
    Fix:     Move key to environment variables, add .env to .gitignore

  DK-CORS-001  high  CORS allows all origins
    File:    src/server.ts
    Impact:  Any website can make authenticated requests to your API
    Fix:     Restrict origins to your actual domain(s)
```

Every finding tells you **what's wrong**, **where it is**, **why it matters**, and **how to fix it**.

---

## What It Checks

Demo Killer isn't just a linter — it runs a **production readiness audit**.

| Check Dimension | What It Finds |
|----------------|---------------|
| **Security** | Hardcoded secrets, SQL injection, XSS, SSRF, command injection, path traversal |
| **Authentication** | Missing auth on routes, weak session config, unsigned webhooks |
| **Input Validation** | Unsanitized request bodies, missing parameter checks, no type safety |
| **Error Handling** | Swallowed exceptions, missing try/catch, exposed stack traces |
| **Observability** | No logging, no health checks, no graceful shutdown |
| **Performance** | N+1 queries, missing timeouts, no connection pooling |
| **Agent Safety** | Prompt injection, unchecked tool execution, context leaks |
| **Business Logic** | Non-idempotent payments, no transaction safety, race conditions |
| **TypeScript** | strict disabled, missing type declarations |
| **Testing** | Zero test files, no CI |
| **Dependencies** | Known vulnerabilities, unused packages, missing lockfile |
| **Deployment** | Docker missing health checks, no graceful shutdown, no env documentation |

Demo Killer also runs **project-type-specific deep rules** for 26 project types — a Python API and a blockchain contract get completely different checks.

---

## How to Read Results

| Verdict | Meaning |
|---------|---------|
| **Launch Blocked** | Blockers found — do not deploy |
| **Hardening Required** | High-severity issues — assess risk before deploying |
| **Minor Issues** | Medium-severity issues — safe to deploy, track for resolution |
| **Production Ready** | No significant issues — safe to deploy |

Every finding includes:
- **File and line number** — where the issue is
- **Severity** — blocker / high / medium / advisory
- **Impact** — what happens if you ignore it in production
- **Acceptance criteria** — what "fixed" actually looks like

---

## Quick Start

```bash
# Global install
npm install -g demokiller

# Check any project
demokiller inspect .

# Markdown output (great for PRs and docs)
demokiller inspect . --format markdown

# SARIF output (plug into GitHub Code Scanning)
demokiller inspect . --format sarif > results.sarif

# Blockers only
demokiller inspect . --severity blocker

# Save a baseline, next run shows only new issues
demokiller inspect . --save-baseline .dk-baseline.json
demokiller recheck .

# Scaffold Agent integration files
demokiller init .
```

Or skip the install entirely:

```bash
npx demokiller inspect . --markdown
```

---

## For Agents

Demo Killer is **agent-native**. It supports MCP, structured JSON, SARIF, and can generate agent instruction files directly.

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

Then tell Claude: *"Run Demo Killer and fix all blockers."*

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

After running `demokiller init .`, skill-capable agents get a `/demokiller` command — auto-triggers production readiness checks, prioritizes blockers, generates an actionable fix plan.

---

## Supported Project Types

Demo Killer detects **26 project types**, each with dedicated deep rules.

<table>
<tr>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" width="36" height="36"><br>
<strong>Web App</strong><br>
<sub>Next.js, React, Vue, Express, FastAPI, Django, Gin</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="36" height="36"><br>
<strong>CLI Tool</strong><br>
<sub>Commander, Yargs, Oclif, Click, Cobra</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg" width="36" height="36"><br>
<strong>Library / SDK</strong><br>
<sub>npm package, Python package, Go module</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" width="36" height="36"><br>
<strong>Python API</strong><br>
<sub>FastAPI, Flask, Django, Litestar</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/electron/electron-original.svg" width="36" height="36"><br>
<strong>Desktop App</strong><br>
<sub>Electron, Tauri</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="36" height="36"><br>
<strong>Mobile App</strong><br>
<sub>React Native, Flutter, Capacitor</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/unity/unity-original.svg" width="36" height="36"><br>
<strong>Game</strong><br>
<sub>Phaser, Pixi, Three.js, Godot, Unity</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/pytorch/pytorch-original.svg" width="36" height="36"><br>
<strong>ML Pipeline</strong><br>
<sub>PyTorch, TensorFlow, Pandas, Scikit</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/🤖-black?style=flat-square&logo=openai&logoColor=white" width="36" height="36"><br>
<strong>Agent / MCP</strong><br>
<sub>LLM agents, tool calling, MCP servers</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nginx/nginx-original.svg" width="36" height="36"><br>
<strong>API Gateway</strong><br>
<sub>Kong, Express Gateway, http-proxy</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/🌐-4285F4?style=flat-square&logo=googlechrome&logoColor=white" width="36" height="36"><br>
<strong>Browser Ext</strong><br>
<sub>Chrome, Firefox, Manifest V3</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" width="36" height="36"><br>
<strong>IDE Plugin</strong><br>
<sub>VS Code extensions</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/⚙️-2088FF?style=flat-square&logo=githubactions&logoColor=white" width="36" height="36"><br>
<strong>CI/CD</strong><br>
<sub>GitHub Actions, GitLab CI, Jenkins</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/prisma/prisma-original.svg" width="36" height="36"><br>
<strong>DB Migration</strong><br>
<sub>Knex, Prisma, TypeORM, Alembic</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/⏰-5BB552?style=flat-square&logo=clock&logoColor=white" width="36" height="36"><br>
<strong>Cron Job</strong><br>
<sub>node-cron, Celery, APScheduler</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/⚡-FF9900?style=flat-square&logo=amazon&logoColor=white" width="36" height="36"><br>
<strong>Serverless</strong><br>
<sub>AWS Lambda, Vercel, Cloudflare</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/apachekafka/apachekafka-original.svg" width="36" height="36"><br>
<strong>Message Queue</strong><br>
<sub>Kafka, RabbitMQ, BullMQ, SQS</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/terraform/terraform-original.svg" width="36" height="36"><br>
<strong>IaC</strong><br>
<sub>Terraform, Pulumi, CDK, CloudFormation</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/⚙️-654FF0?style=flat-square&logo=webassembly&logoColor=white" width="36" height="36"><br>
<strong>WASM</strong><br>
<sub>wasm-pack, AssemblyScript</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/solidity/solidity-original.svg" width="36" height="36"><br>
<strong>Blockchain</strong><br>
<sub>Solidity, ethers.js, web3.js</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/arduino/arduino-original.svg" width="36" height="36"><br>
<strong>IoT / Embedded</strong><br>
<sub>PlatformIO, Johnny-Five, Arduino</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg" width="36" height="36"><br>
<strong>DevOps Script</strong><br>
<sub>Shell, zx, deploy automation</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/hugo/hugo-original.svg" width="36" height="36"><br>
<strong>Static Site</strong><br>
<sub>Astro, Hugo, Gatsby, Eleventy</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/📝-4F5D6E?style=flat-square&logo=codeship&logoColor=white" width="36" height="36"><br>
<strong>CMS</strong><br>
<sub>Strapi, Directus, Keystone, Payload</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/grafana/grafana-original.svg" width="36" height="36"><br>
<strong>Monitoring</strong><br>
<sub>Prometheus, Grafana, StatsD, Datadog</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/💳-635BFF?style=flat-square&logo=stripe&logoColor=white" width="36" height="36"><br>
<strong>Payment</strong><br>
<sub>Stripe, PayPal, Square</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/🔐-009688?style=flat-square&logo=lock&logoColor=white" width="36" height="36"><br>
<strong>Auth Service</strong><br>
<sub>Passport, NextAuth, Clerk, Auth.js</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg" width="36" height="36"><br>
<strong>Systems C/C++</strong><br>
<sub>Kernel, Drivers, Native Apps, Embedded Firmware</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Each type gets 3-6 dedicated deep rules on top of universal rules.</sub>
</p>

---

## Supported Languages

Demo Killer analyzes **18 languages** with language-aware parsing.

<table>
<tr>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="32" height="32"><br>
<strong>TypeScript</strong><br>
<sub>✅ AST ✅ Call Graph ✅ Taint</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" width="32" height="32"><br>
<strong>JavaScript</strong><br>
<sub>✅ AST ✅ Call Graph ✅ Taint</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" width="32" height="32"><br>
<strong>Python</strong><br>
<sub>✅ AST ✅ BFS Call Graph ✅ Taint</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg" width="32" height="32"><br>
<strong>Go</strong><br>
<sub>✅ AST ⚠️ Regex Call Graph</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-original.svg" width="32" height="32"><br>
<strong>Rust</strong><br>
<sub>✅ AST ⚠️ Regex Call Graph</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" width="32" height="32"><br>
<strong>Java</strong><br>
<sub>✅ AST ⚠️ Regex Call Graph</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg" width="32" height="32"><br>
<strong>C#</strong><br>
<sub>✅ AST ⚠️ Regex Call Graph</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg" width="32" height="32"><br>
<strong>PHP</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg" width="32" height="32"><br>
<strong>Ruby</strong><br>
<sub>✅ AST</sub>
</td>
</tr>
<tr>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/swift/swift-original.svg" width="32" height="32"><br>
<strong>Swift</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg" width="32" height="32"><br>
<strong>Kotlin</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/scala/scala-original.svg" width="32" height="32"><br>
<strong>Scala</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg" width="32" height="32"><br>
<strong>Dart</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg" width="32" height="32"><br>
<strong>C / C++</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg" width="32" height="32"><br>
<strong>Shell</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/lua/lua-original.svg" width="32" height="32"><br>
<strong>Lua</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg" width="32" height="32"><br>
<strong>Vue</strong><br>
<sub>✅ AST</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/zig/zig-original.svg" width="32" height="32"><br>
<strong>Zig</strong><br>
<sub>✅ AST</sub>
</td>
</tr>
</table>

---

## MCP Server

Demo Killer runs as an MCP server, exposing 3 tools for agents:

| Tool | What It Does |
|------|-------------|
| `inspect_project` | Full audit, JSON or Markdown output |
| `list_launch_blockers` | Returns only blocker-level findings |
| `generate_hardening_plan` | Three-phase fix plan: blockers → hardening → improvements |

Start the server:

```bash
npx demokiller-mcp
```

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `demokiller inspect .` | Full production readiness audit |
| `demokiller inspect . --format markdown` | Markdown output, great for PRs |
| `demokiller inspect . --format sarif` | SARIF output, plug into GitHub Code Scanning |
| `demokiller inspect . --severity blocker` | Blockers only |
| `demokiller inspect . --save-baseline .dk.json` | Save current state as baseline |
| `demokiller recheck .` | Diff against baseline, new issues only |
| `demokiller init .` | Scaffold agent integration files |
| `demokiller benchmark benchmarks/list.json` | Run benchmark suite |

---

## vs. Other Tools

| | CodeQL | SonarQube | Semgrep | Snyk | **Demo Killer** |
|---|---|---|---|---|---|
| **Purpose** | Find vulns | Find code smells | Find patterns | Find dep vulns | **Find deployment blockers** |
| **Output** | "47 medium issues" | "D grade" | "12 findings" | "3 high" | **"Launch Blocked"** |
| **Project types** | Generic | Generic | Generic | Generic | **26 types, type-specific rules** |
| **Agent-native** | ❌ | ❌ | ❌ | ❌ | **✅ MCP, Skills, JSON, SARIF** |
| **Verdict** | None | Score | None | None | **4-level verdict** |
| **Impact description** | None | None | None | None | **"What happens if ignored"** |
| **Acceptance criteria** | None | None | None | None | **"What fixed looks like"** |

CodeQL tells you what's wrong with your code. **Demo Killer tells you if your project is ready to ship.**

---

## Roadmap

- Systematic false-positive rate measurement across 100+ real projects
- Per-file analysis replacing content concatenation (reduce cross-file false positives)
- Java, C#, PHP, Ruby call graph support
- Plugin API for custom rules
- VS Code extension

---

## License

[MIT](LICENSE) — use it however you want.

<p align="center">
  <sub>Built for people who actually ship, not for people who demo.</sub>
</p>
