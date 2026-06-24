# Changelog

## 0.4.2

### Features

- **Config file support**: `.demokillerc.json` / `.demokiller.json` / `demokiller.config.json` for rule customization, exclude patterns, severity overrides, and CI thresholds.
- **PHP/Laravel fixture**: Tests for Laravel route detection and OpenAI integration.
- **Ruby/Rails fixture**: Tests for Rails controller detection and OpenAI integration.
- **C#/ASP.NET fixture**: Tests for ASP.NET controller detection.
- **New inventory fields**: `hasTests`, `hasTypeScript`, `tsStrictMode`, `hasReadme`, `hasLicense`, `hasChangelog`, `isNpmPackage`, `npmFilesField`.

### Fixes

- Rails controller files (`*_controller.rb`) now detected as route files.
- ASP.NET `[ApiController]` and `[HttpPost(...)]` patterns detected.
- Golden files regenerated from current build.

## 0.4.1

### Features

- **5 Agent ecosystem rules**: DK-AGENT-001 through DK-AGENT-005 covering LLM code execution, MCP auth, tool rate limits, prompt injection, and context leaks.
- **4 Project quality rules**: DK-TEST-001 (missing tests), DK-TYPES-001 (TS strict mode), DK-README-001 (missing docs), DK-PUBLISH-001 (npm files field).
- **New inventory fields**: `hasTests`, `hasTypeScript`, `tsStrictMode`, `hasReadme`, `hasLicense`, `hasChangelog`, `isNpmPackage`, `npmFilesField`.
- **Agent detection signals**: `evaluatesLlmOutput`, `mcpServer`, `agentTool`, `promptInjection`, `contextLeak` in source-inspector.

### Fixes

- LICENSE detection now works for files without extension (`LICENSE` not just `LICENSE.md`).
- Project-level rules (tests, types, docs, publish) only fire for recognized stacks with actual code — no false positives on empty fixtures.
- Prompt injection regex tightened to avoid false positive on standard `messages[].content` pattern.

### Total: 31 rules (14 security + 5 agent + 12 quality)

## 0.4.0

### Breaking Changes

- **Migrated from ts-morph to web-tree-sitter**: All AST-based detection now uses tree-sitter via pre-compiled WASM grammars. ts-morph dependency removed.

### Features

- **18 languages supported**: JavaScript, TypeScript, Python, Go, Rust, Java, Kotlin, Scala, C#, PHP, Ruby, Swift, C, C++, Lua, Shell, Dart, Zig.
- **21 frameworks**: Next.js, Express, Fastify, FastAPI, Flask, Django, Gin, Echo, Fiber, Actix, Axum, Rocket, Spring Boot, Ktor, Laravel, Rails, Sinatra, ASP.NET, Vapor, http4s, Akka.
- **Quality metrics**: Routes now include `metrics` field with cyclomatic complexity, function count, average function length, and longest function.
- **Tree-sitter AST detection**: Logging, debug statements, error handling detected via AST for all 18 languages (higher precision than text-only).
- **New dependency parsers**: composer.json (PHP), Gemfile (Ruby), .csproj (C#), Package.swift (Swift), build.gradle (Kotlin/Scala).

### Architecture

- `web-tree-sitter` + `tree-sitter-wasms` replaces `ts-morph` (no native compilation needed, works on all platforms).
- WASM grammars loaded on-demand per file extension.
- Text-based detection retained as fallback and supplement.

## 0.3.0

### Features

- **Go support**: Gin, Echo, Fiber framework detection via `go.mod` parsing and Go route pattern scanning.
- **Rust support**: Actix, Axum framework detection via `Cargo.toml` parsing and Rust route attribute scanning.
- **Java support**: Spring Boot framework detection via `build.gradle`/`pom.xml` parsing and annotation scanning.
- **8 new rules** (22 total):
  - `DK-SQLI-001` — SQL queries built with string interpolation
  - `DK-PATH-001` — File access with user-controlled paths
  - `DK-INSEC-001` — Unsafe deserialization or eval
  - `DK-CSP-001` — Missing security headers
  - `DK-HTTPS-001` — Missing HTTPS enforcement / HSTS
  - `DK-DEP-001` — Known dependency vulnerabilities (npm audit / pip-audit)
  - `DK-DOCKER-001` — Dockerfile security issues
- **Plugin entry point**: `src/plugin.ts` exports `runInspection`, `buildInventory`, `analyzeFindings` as a programmatic API.
- **Dependency audit integration**: Automatically runs `npm audit` or `pip-audit` and includes high/critical findings.
- **Docker security check**: Scans Dockerfile for root user, :latest tag, exposed debug ports, missing HEALTHCHECK.

### Architecture

- Source inspector extended with Go, Rust, Java text-based detection patterns.
- Inventory supports 6 language ecosystems (JS/TS, Python, Go, Rust, Java) with auto-detection cascade.
- `ProjectInventory` now includes `hasDockerfile` field.

## 0.2.0

### Features

- **MCP Server**: `demokiller-mcp` exposes 3 tools (`inspect_project`, `list_launch_blockers`, `generate_hardening_plan`) over stdio for Claude Code, Cursor, and Claude Desktop.
- **Agent Skill**: `demokiller init .` writes `.claude/skills/demokiller/SKILL.md` following the [Agent Skills](https://agentskills.io) open standard. Invoked as `/demokiller` or auto-triggered on launch/deploy context.
- **11 production rules** (up from 6):
  - `DK-INPUT-001` — API routes consuming request body without schema validation
  - `DK-ERR-001` — API routes without error handling
  - `DK-DATA-001` — Database reads returned without field filtering
  - `DK-CORS-001` — Wildcard CORS (`Access-Control-Allow-Origin: *`)
  - `DK-DEBUG-001` — Console.log/debug in production routes
- **Express/Fastify support**: Detects Express and Fastify projects, scans for route patterns (`app.get/post`, `router.get/post`, `fastify.route`).
- **CLI `recheck` command**: `demokiller recheck .` diffs current findings against a saved snapshot. `inspect` now auto-saves to `.demokiller/last-report.json`.
- **GitHub Actions workflow**: `.github/workflows/demokiller.yml` runs on PR, posts findings as a comment, fails CI on `Launch Blocked`.
- **Positive-path fixture**: `next-ai-saas-hardened` with zod validation, try-catch, auth, quota, structured logging, webhook signature verification — verifies zero false positives.

### Fixes

- `hasSupportedProjectEvidence` now derived from inventory instead of hardcoded `true`.
- Prisma mutation detection handles `prisma.model.method()` pattern (not just `prisma.method()`).
- Admin route detection matches "admin" in any path position (not just `/admin/`).
- Logging detection extended to structured loggers (`logger.*`, `auditLog`).
- Quota control detection added (`quota`, `usageLimit`, `monthlyLimit`).

### Architecture

- Source inspector refactored into pluggable architecture: language-agnostic text-based detection + language-specific AST detection. Ready for Python/Go/Rust detectors.

## 0.1.1

- Initial release: CLI (`inspect`, `init`, `benchmark`), 6 rules, Next.js App Router + TypeScript support.
