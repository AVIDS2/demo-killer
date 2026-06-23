# Changelog

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
