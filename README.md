<p align="center">
  <img src="assets/demokiller-banner.svg" alt="Demo Killer - Agent-native production gate" width="760" />
</p>

<h1 align="center">Demo Killer</h1>

<p align="center">
  <strong>杀死你的 demo，转型成真正的可生产交付落地级。</strong>
</p>

<p align="center">
  给 AI 生成项目准备的上线前生产闸门：找出 launch blocker，解释真实生产后果，并给出可复查的 hardening plan。
</p>

<p align="center">
  <a href="README.en.md">English</a>
  ·
  <a href="https://www.npmjs.com/package/demokiller">npm</a>
  ·
  <a href="https://github.com/AVIDS2/demokiller">GitHub</a>
  ·
  <a href="#快速开始">快速开始</a>
  ·
  <a href="#agent-工作流">Agent 工作流</a>
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
  <strong>Evidence-backed blockers</strong>
  ·
  <strong>Production consequences</strong>
  ·
  <strong>Agent guidance</strong>
  ·
  <strong>Hardening plan</strong>
  ·
  <strong>Recheck loop</strong>
</p>

---

> Using Codex, Claude Code, Cursor, Gemini CLI, or another AI coding agent? Run `npx demokiller init .` first. Demo Killer will write an agent-facing production gate so `Launch Blocked` does not get buried under cosmetic fixes.

Demo Killer 是给 AI 生成项目准备的生产交付闸门。它会在上线前告诉你：这个看起来能跑的项目为什么本质上还是 demo，真实生产环境会出什么问题，以及优先修什么才能继续往上线推进。

它不是普通代码扫描器，也不是一个“生产就绪认证”。它更像一个本地的上线前生产工程师：

- 找出 launch blocker，而不是给一个虚假的高分。
- 用文件证据解释问题，而不是泛泛提醒“注意安全”。
- 讲清楚生产后果，而不是只列 checklist。
- 给出分阶段 hardening plan，而不是丢给你一堆无序任务。
- 让 AI agent 也能把 Demo Killer 当作交付前闸门。

## 产品快照

<table>
  <tr>
    <td><strong>包名</strong><br><code>demokiller</code></td>
    <td><strong>运行时</strong><br>Node 18+</td>
    <td><strong>模式</strong><br><code>inspect</code> · <code>init</code> · <code>benchmark</code></td>
  </tr>
  <tr>
    <td><strong>输出</strong><br>Markdown · JSON</td>
    <td><strong>支持范围</strong><br>Next.js App Router · TypeScript</td>
    <td><strong>闸门</strong><br><code>Launch Blocked</code></td>
  </tr>
</table>

## 为什么需要它

现在很多开发者用 AI 可以很快做出“看起来完成”的项目：页面能打开，API 能返回，支付能回调，AI 能生成内容，数据库也能写入。

问题是：能跑不等于能上线。

真实生产会遇到的不是 demo 场景：

- 公开 API 被脚本刷爆，烧掉 OpenAI/Claude/Stripe 等付费额度。
- 管理接口缺少授权边界，用户数据被误删或越权修改。
- Webhook 没验签、没幂等，支付状态被伪造或重复处理。
- `.env.example` 不完整，部署时才发现关键变量缺失。
- Prisma schema 有了，但没有 migration，生产数据库不可复现。
- 关键 mutation 没日志，出事故时无法定位和恢复。

Demo Killer 的目标不是替你“美化 demo”，而是把这些 demo 幻觉杀掉。

## 快速开始

不需要先全局安装：

```powershell
npx demokiller --help
npx demokiller init .
npx demokiller inspect . --markdown
```

`init` 会把 Demo Killer 接入你的 agent 工作流：

```text
.demokiller/AGENT.md
AGENTS.md
```

之后 Codex、Claude Code、Cursor、Gemini CLI 等 agent 进入项目时，就能知道：上线、发布、部署、交付前必须运行 Demo Killer，并把 `Launch Blocked` 当作阻断信号。

## 一个典型输出

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

Demo Killer 不会只说“这里可能有风险”。它会把风险拆成：

```text
入口 -> 能力 -> 资产 -> 缺失控制 -> 生产后果 -> 修复验收标准
```

这也是它和普通 linter、SAST、依赖漏洞扫描器的区别。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npx demokiller init .` | 写入 agent 生产闸门说明 |
| `npx demokiller inspect . --markdown` | 检查当前项目，输出人类可读报告 |
| `npx demokiller inspect . --json` | 输出 agent/CI 可读 JSON |
| `npx demokiller inspect https://github.com/owner/repo --markdown` | 检查公开 GitHub 仓库 |
| `demokiller benchmark <manifest-path>` | 运行指定 benchmark manifest |

也可以全局安装：

```powershell
npm install -g demokiller
demokiller inspect . --markdown
```

## 当前能检查什么

第一阶段聚焦 AI 生成项目里最高频、最容易被忽略的生产缺口：

| 规则 | 检查内容 |
| --- | --- |
| `DK-AI-001` | 公开 AI/付费能力是否缺少 auth、quota、rate limit、abuse logging |
| `DK-AUTH-001` | 管理/数据 mutation 路由是否缺少认证和授权 |
| `DK-WEBHOOK-001` | Stripe/payment webhook 是否缺少验签和幂等 |
| `DK-ENV-001` | 生产环境变量是否有明确 env contract |
| `DK-DB-001` | Prisma schema 是否缺少 migration 证据 |
| `DK-OBS-001` | 关键 mutation 路径是否缺少诊断日志 |

## 支持范围

当前版本故意很窄：

- Next.js App Router
- TypeScript
- 本地静态检查
- AI/SaaS 风格应用
- 本地目录或公开 GitHub 仓库

如果项目不在支持范围内，Demo Killer 会返回 `Insufficient Evidence`，而不是假装它已经证明项目可上线。

## Verdict 模型

Demo Killer 不输出 `Production Ready`。

这个词太大了。真正的生产就绪还需要运行时验证、部署验证、负载测试、安全审查、备份恢复、监控告警、人工产品判断，以及团队运维能力。

当前 verdict：

| Verdict | 含义 |
| --- | --- |
| `Launch Blocked` | 有明确上线阻断项 |
| `Demo` | 有生产缺口，但不一定是最高级阻断 |
| `Production Candidate` | 在当前支持范围内没有发现已知阻断，不代表完全生产就绪 |
| `Insufficient Evidence` | 证据不足，不能做可信判断 |

## Agent 工作流

推荐把 Demo Killer 放进每次上线前的固定流程：

```powershell
npx demokiller init .
npx demokiller inspect . --markdown
```

然后让 agent 按这个顺序工作：

1. 先读 `Launch Blocked` findings。
2. 修 Phase 0 阻断项。
3. 每修一轮重新运行 `demokiller inspect . --markdown`。
4. 不把 UI polish、重构、README 美化当作生产化完成。
5. 只有阻断项消失后，再讨论是否进入部署、压测、安全审查、人工 review。

这就是 Demo Killer 的核心产品形态：它不是替 agent 写代码，而是告诉 agent 什么叫“还不能交付”。

## Benchmark

项目内置公开 GitHub 样本 benchmark，用来防止 Demo Killer 退化成只会检查一个 fixture 的 demo。在本仓库开发时运行：

```powershell
npm run benchmark
```

输出会显示：

- 样本总数
- archetype 覆盖
- verdict 是否符合预期
- rule id 是否符合预期
- clone 或分析错误

当前 benchmark 覆盖 `ai-saas`、`payment-starter`、`api-backend`、`admin-panel`、`automation-worker`、`agent-app`、`content-site` 等项目形态。

## 本地开发

```powershell
git clone https://github.com/AVIDS2/demokiller.git
cd demokiller
npm install
npm test
npm run typecheck
npm run build
node dist/src/cli.js inspect fixtures/next-ai-saas-risky --markdown
```

发布前检查：

```powershell
npm test
npm run typecheck
npm run build
npm audit --json
npm pack --dry-run
```

## Roadmap

- CLI: 本地检查、GitHub URL 检查、Markdown/JSON 报告。
- Agent guidance: `demokiller init` 写入 agent 工作契约。
- MCP: 让 agent 直接调用 `inspect_project`、`list_launch_blockers`、`generate_hardening_plan`。
- Skills/plugins: Codex、Claude Code、Cursor 等工作流集成。
- CI: GitHub Actions/PR comment，上线前提醒或阻断。
- 更广支持：更多框架、更多生产风险域、更多 benchmark 样本。

## 项目原则

- 不做没有证据的阻断判断。
- 不承诺完整生产就绪。
- 不用漂亮 dashboard 掩盖规则质量不足。
- 不把所有框架一次性纳入支持范围。
- 不让 LLM 成为唯一裁判。
- 不把“看起来能跑”当作“可以交付”。

## License

MIT
