<p align="center">
  <img src="assets/demokiller-banner.svg" alt="Demo Killer - Agent-native production gate" width="760" />
</p>

<h1 align="center">Demo Killer</h1>

<p align="center">
  <strong>Kill your demo and turn it into a truly production-deliverable system.</strong>
</p>

<p align="center">
  An open-source production-readiness gate for AI-built software. The current release connects to coding agents through the npm CLI, MCP server, Agent Skills, and agent guidance, with plugins and CI on the roadmap.
</p>

<p align="center">
  <a href="README.md">简体中文</a>
  ·
  <a href="https://www.npmjs.com/package/demokiller">npm</a>
  ·
  <a href="https://github.com/AVIDS2/demokiller">GitHub</a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#for-agents">For Agents</a>
  ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/demokiller"><img alt="npm version" src="https://img.shields.io/npm/v/demokiller?style=flat-square&label=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/demokiller"><img alt="npm downloads" src="https://img.shields.io/npm/dm/demokiller?style=flat-square&label=downloads&color=0ea5e9"></a>
  <a href="https://github.com/AVIDS2/demokiller/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/demokiller?style=flat-square&label=license&color=22c55e"></a>
  <a href="https://github.com/AVIDS2/demokiller/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://github.com/AVIDS2/demokiller/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/AVIDS2/demokiller?style=flat-square&label=stars&color=facc15"></a>
</p>

<p align="center">
  <strong>CLI</strong>
  ·
  <strong>MCP</strong>
  ·
  <strong>Agent Skills</strong>
  ·
  <strong>Plugin</strong>
  ·
  <strong>Production Gate</strong>
</p>

---

> Using Codex, Claude Code, Cursor, Gemini CLI, or another AI coding agent? Run `npx demokiller init .` first. Demo Killer will write an agent-facing production gate so `Launch Blocked` does not get buried under cosmetic fixes.

Demo Killer is an open-source production-readiness gate for AI-built software. It helps coding agents such as Codex, Claude Code, Cursor, and Gemini CLI check real launch blockers before handoff instead of treating a working demo as a production system.

The current release is centered on the npm CLI and agent guidance. The roadmap expands the same gate into an MCP server, Agent Skills, Claude/Codex/Cursor plugins, and CI gates. Demo Killer is not a generic scanner or a fake "production ready" certificate. Think of it as a local production engineer before launch:

- Finds launch blockers instead of giving a vague score.
- Explains findings with file evidence.
- Describes real production consequences.
- Produces a phased hardening plan.
- Gives AI coding agents a concrete production gate.

## Product Snapshot

<table>
  <tr>
    <td><strong>Package</strong><br><code>demokiller</code></td>
    <td><strong>Runtime</strong><br>Node 18+</td>
    <td><strong>Current entry points</strong><br>npm CLI · MCP · Agent Skills · Agent guidance</td>
  </tr>
  <tr>
    <td><strong>Output</strong><br>Markdown · JSON</td>
    <td><strong>Supported scope</strong><br>Next.js App Router · TypeScript</td>
    <td><strong>Gate</strong><br><code>Launch Blocked</code></td>
  </tr>
  <tr>
    <td><strong>Current commands</strong><br><code>inspect</code> · <code>init</code> · <code>benchmark</code> · <code>mcp</code></td>
    <td><strong>Planned entry points</strong><br>Plugin · CI</td>
    <td><strong>Use cases</strong><br>Pre-launch · Handoff · Agent hardening loop</td>
  </tr>
</table>

## What You Can Do With It

- Check a local project or public GitHub repository before handoff, release, or deployment.
- Find launch blockers instead of getting a generic checklist.
- See file evidence, production consequences, and acceptance criteria for each finding.
- Output Markdown for humans and JSON for agents, scripts, or CI.
- Use `demokiller init` to wire the gate into Codex, Claude Code, Cursor, Gemini CLI, and similar agent workflows.

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
.claude/skills/demokiller/SKILL.md
AGENTS.md
```

If your agent supports MCP (Claude Code, Cursor, Claude Desktop), you can also configure the MCP server directly. See [MCP Server](#mcp-server).

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
| `npx demokiller-mcp` | Start MCP server for Claude / Cursor clients |
| `demokiller benchmark <manifest-path>` | Run a benchmark manifest |

Global install is also supported:

```powershell
npm install -g demokiller
demokiller inspect . --markdown
```

## Current Coverage

Demo Killer currently works best for:

- **JavaScript/TypeScript**: Next.js, Express, Fastify
- **Python**: FastAPI, Flask, Django
- **Go**: Gin, Echo, Fiber
- **Rust**: Actix, Axum, Rocket
- **Java**: Spring Boot
- **Kotlin**: Ktor
- **Scala**: http4s, Akka
- **C#**: ASP.NET
- **PHP**: Laravel
- **Ruby**: Rails, Sinatra
- **Swift**: Vapor
- **C/C++**, **Lua**, **Shell**, **Dart**, **Zig**: basic detection support

Total: **18 languages, 21 frameworks**.
- Local directories or public GitHub repositories.
- Teams and independent builders who want an actionable hardening list before handoff.

Current rules focus on high-signal pre-launch risks:

| Rule | Detects |
| --- | --- |
| **Security Rules** | |
| `DK-AI-001` | Public paid AI capability without auth, quota, rate limiting |
| `DK-AUTH-001` | Admin/data mutation routes without authentication and authorization |
| `DK-WEBHOOK-001` | Payment webhooks without signature verification and idempotency |
| `DK-INPUT-001` | API routes consuming request body without schema validation |
| `DK-ERR-001` | API routes without error handling that may leak internals |
| `DK-DATA-001` | Database read results returned without field filtering |
| `DK-CORS-001` | API routes allowing requests from any origin |
| `DK-SSRF-001` | HTTP requests with potentially user-controlled URLs |
| `DK-CMDI-001` | Routes executing system commands (command injection risk) |
| `DK-SECRET-001` | Hardcoded API keys or secrets in source code |
| `DK-SQLI-001` | SQL queries built with string interpolation instead of parameterized statements |
| `DK-PATH-001` | File system access using unsanitized user-controlled paths |
| `DK-INSEC-001` | Unsafe deserialization or eval with user input |
| `DK-HTTPS-001` | Missing HTTPS enforcement or HSTS header |
| **Agent Ecosystem Rules** | |
| `DK-AGENT-001` | LLM output passed to eval/exec (code execution) |
| `DK-AGENT-002` | MCP server tools without authentication |
| `DK-AGENT-003` | Agent tools without call frequency limits |
| `DK-AGENT-004` | User input directly interpolated into prompts (injection risk) |
| `DK-AGENT-005` | System prompt or memory leaked to users |
| **Quality Rules** | |
| `DK-DEBUG-001` | Production routes containing console.log or debug statements |
| `DK-CSP-001` | API responses missing CSP, X-Frame-Options, security headers |
| `DK-LOGI-001` | User-controlled input written directly to logs |
| `DK-DEP-001` | Dependencies with known high/critical vulnerabilities |
| `DK-DOCKER-001` | Dockerfile security issues (root user, :latest, debug ports) |
| `DK-ENV-001` | Missing production environment contract |
| `DK-DB-001` | Prisma schema without migration evidence |
| `DK-OBS-001` | Critical mutation path without diagnostic logging |
| `DK-TEST-001` | Project has no test files |
| `DK-TYPES-001` | TypeScript project without strict mode |
| `DK-README-001` | Project missing README or LICENSE |
| `DK-PUBLISH-001` | npm package without `files` field (may publish sensitive files) |

If Demo Killer cannot collect enough supported evidence, it returns `Insufficient Evidence` instead of dressing uncertainty up as a launch signal.

## How To Read Results

Demo Killer does not mark projects as `Production Ready`. Launch still requires deployment validation, runtime checks, load testing, security review, monitoring, and human judgment.

Start with the verdict and Phase 0 findings:

| Verdict | What it means | Next step |
| --- | --- | --- |
| `Launch Blocked` | A concrete blocker prevents responsible launch | Pause release and fix blockers first |
| `Demo` | Production gaps exist, but may not all be launch blockers | Follow the hardening plan in phases |
| `Production Candidate` | Current rules found no known blocker | Continue with deployment validation, load testing, security review, and human review |
| `Insufficient Evidence` | Demo Killer cannot make a reliable judgment | Add project evidence, switch to human review, or wait for broader framework support |

## For Agents

### Option 1: MCP (Recommended)

If your agent supports MCP, configure `demokiller-mcp` and the agent can call `inspect_project`, `list_launch_blockers`, and `generate_hardening_plan` directly. See [MCP Server](#mcp-server).

### Option 2: CLI + Agent Guidance

Recommended workflow before handoff:

```powershell
npx demokiller init .
npx demokiller inspect . --markdown
```

Then have your agent:

1. Read `Launch Blocked` and Phase 0 findings first.
2. Fix blockers before polish work or refactors.
3. Re-run `demokiller inspect . --markdown` after each hardening pass.
4. Move to deployment validation, load testing, security review, and human review after blockers are gone.

Demo Killer does not write application code for your agent. It gives the agent an executable, recheckable production-readiness gate.

## MCP Server

Demo Killer includes an MCP server for Claude Code, Cursor, Claude Desktop, and other MCP clients.

### Available Tools

| Tool | Purpose |
| --- | --- |
| `inspect_project` | Full production-readiness inspection returning verdict, findings, and hardening plan |
| `list_launch_blockers` | Return only blocker-severity findings for fast go/no-go decisions |
| `generate_hardening_plan` | Return a phased hardening plan to guide the fix sequence |

### Configuration

**Claude Code** — add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "demokiller": {
      "command": "npx",
      "args": ["-y", "demokiller-mcp"]
    }
  }
}
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "demokiller": {
      "command": "npx",
      "args": ["-y", "demokiller-mcp"]
    }
  }
}
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "demokiller": {
      "command": "npx",
      "args": ["-y", "demokiller-mcp"]
    }
  }
}
```

## Agent Skill

`demokiller init .` writes `.claude/skills/demokiller/SKILL.md` following the [Agent Skills](https://agentskills.io) open standard. Claude Code, Cursor, Copilot, Gemini CLI, and other compatible agents will recognize it automatically.

Usage:

- **Manual**: Type `/demokiller` in Claude Code to run a check and fix in phase order.
- **Auto-trigger**: When the conversation involves launch, deploy, release, or go-live, the agent loads this skill automatically.
- **MCP integration**: If `demokiller-mcp` is configured, the agent can call tools directly without CLI.

The skill file is idempotent — re-running `demokiller init .` does not overwrite a customized skill.

## Development And Contribution

To contribute rules, integrations, or benchmark samples, start with the local checks:

```powershell
git clone https://github.com/AVIDS2/demokiller.git
cd demokiller
npm install
npm test
npm run typecheck
npm run build
```

The repository also includes a public GitHub benchmark set for checking coverage across project shapes:

```powershell
npm run benchmark
```

Recommended pre-publish checks:

```powershell
npm test
npm run typecheck
npm run build
npm audit --json
npm pack --dry-run
```

## How To Add A Rule

Adding a rule takes 3 steps:

**1. Add a detection signal in `src/source-inspector.ts`**

For text-detectable patterns (regex/string matching), add to `detectCapabilitiesFromText()` or `detectControlsFromText()`. For AST-only patterns, add to `detectFromJsTsAst()`.

**2. Create a rule file in `src/rules/`**

Follow existing rules (e.g. `src/rules/input-validation.ts`). Implement a function that takes `RouteSourceEvidence` and returns `Finding[]`.

**3. Register in `src/rules/index.ts`**

Import the new rule and add `...routeEvidence.flatMap(yourNewRule)` to the `analyzeFindings` return array.

Update `fixtures/expected/*.findings.json` golden files and the README rule table, then run `npm test`.

## Roadmap

- Plugin entry points for non-MCP, non-Skill agents.
- Python (Flask/FastAPI/Django) detector.
- Go (Gin/Echo) detector.
- More production risk domains and benchmark samples.

## License

MIT
