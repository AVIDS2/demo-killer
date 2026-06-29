# Demo Killer

<p align="center">
  <img src="assets/demokiller-banner.svg" alt="Demo Killer" width="720">
</p>

<p align="center">
  <strong>AI 造 demo，Demo Killer 杀掉 demo 幻觉。</strong><br>
  面向 AI 生成项目的开源生产就绪闸门 — 155 条规则、26 种项目类型、18 种语言、一条命令。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/demokiller"><img src="https://img.shields.io/npm/v/demokiller.svg?style=for-the-badge&logo=npm&color=cb3837" alt="npm"></a>
  <a href="https://www.npmjs.com/package/demokiller"><img src="https://img.shields.io/npm/dm/demokiller.svg?style=for-the-badge&logo=npm&color=7c3aed" alt="downloads"></a>
  <a href="https://github.com/AVIDS2/demokiller/actions"><img src="https://img.shields.io/github/actions/workflow/status/AVIDS2/demokiller/ci.yml?style=for-the-badge&label=CI&logo=github" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2563eb?style=for-the-badge" alt="license"></a>
  <a href="https://github.com/AVIDS2/demokiller"><img src="https://img.shields.io/github/stars/AVIDS2/demokiller?style=for-the-badge&logo=github&color=facc15" alt="stars"></a>
</p>

<p align="center">
  <a href="README.en.md">English</a> |
  <a href="#快速开始">快速开始</a> |
  <a href="#它检查什么">它检查什么</a> |
  <a href="#给-agent-使用">给 Agent 使用</a> |
  <a href="#支持的项目类型">项目类型</a> |
  <a href="#支持的语言">语言</a>
</p>

---

## 问题

你花了三个月打磨项目，用 AI 工具加速开发，功能测试都过了，准备上线。

但你心里清楚：生产环境比 demo 严酷得多。

- API Key 硬编码在源码里
- 任何接口都没有输入校验
- Webhook 签名从未验证
- Admin 路由对所有人开放
- CORS 全开，没有 CSP，没有 HTTPS 重定向
- 零测试、零错误处理

你的 linter 给了 87 分。Demo Killer 给你：**Launch Blocked**。

---

## 一条命令

```bash
npx demokiller inspect . --markdown
```

不用安装，不用配置。指向任何项目，直接给结论。

```
verdict: Launch Blocked

  DK-AI-001  blocker  检测到硬编码 API Key
    文件:    src/lib/openai.ts
    后果:    API Key 暴露在源码中，任何有仓库访问权限的人都能看到
    修复:    将 Key 移到环境变量，.env 加入 .gitignore

  DK-CORS-001  high  CORS 允许所有来源
    文件:    src/server.ts
    后果:    任何网站都可以向你的 API 发起认证请求
    修复:    限制 origins 为你的实际域名
```

每个发现告诉你 **什么问题**、**在哪里**、**为什么重要**、**怎么修**。

---

## 它检查什么

Demo Killer 不只是 lint — 它跑的是**生产就绪审计**。

| 检查维度 | 发现什么 |
|---------|---------|
| **安全** | 硬编码密钥、SQL 注入、XSS、SSRF、命令注入、路径穿越 |
| **认证** | 路由缺认证、弱会话配置、Webhook 未签名 |
| **输入校验** | 未清洗的请求体、缺少参数检查、无类型安全 |
| **错误处理** | 吞异常、缺 try/catch、暴露堆栈 |
| **可观测性** | 无日志、无健康检查、无优雅关闭 |
| **性能** | N+1 查询、缺超时、无连接池 |
| **Agent 安全** | Prompt 注入、未检查的工具执行、上下文泄露 |
| **业务逻辑** | 支付缺幂等、无事务安全、竞态条件 |
| **TypeScript** | strict 关闭、缺类型声明 |
| **测试** | 零测试文件、无 CI |
| **依赖** | 已知漏洞、未使用包、缺 lockfile |
| **部署** | Docker 缺健康检查、无优雅关闭、无环境变量文档 |

Demo Killer 还会针对 **26 种项目类型** 跑专属规则 — Python API 和区块链合约检查的完全不同。

---

## 结果怎么看

| 判定 | 含义 |
|------|------|
| **Launch Blocked** | 有 blocker，不要上线 |
| **Hardening Required** | 有 high 级别问题，上线需风险评估 |
| **Minor Issues** | 有 medium 级别问题，可以上线但要跟踪 |
| **Production Ready** | 无显著问题，可以上线 |

每个发现包含：
- **文件和行号** — 问题在哪
- **严重级别** — blocker / high / medium / advisory
- **后果** — 忽略这个问题在生产环境会发生什么
- **验收标准** — "修好了"具体长什么样

---

## 快速开始

```bash
# 全局安装
npm install -g demokiller

# 检查任何项目
demokiller inspect .

# 输出 Markdown（适合 PR 和文档）
demokiller inspect . --format markdown

# 输出 SARIF（接 GitHub Code Scanning）
demokiller inspect . --format sarif > results.sarif

# 只看 blocker
demokiller inspect . --severity blocker

# 保存基线，下次只看新增问题
demokiller inspect . --save-baseline .dk-baseline.json
demokiller recheck .

# 脚手架生成 Agent 集成文件
demokiller init .
```

或者完全不装：

```bash
npx demokiller inspect . --markdown
```

---

## 给 Agent 使用

Demo Killer 是 **Agent 原生**的。支持 MCP、结构化 JSON、SARIF，能直接生成 Agent 指导文件。

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

然后跟 Claude 说：*"跑一下 Demo Killer 检查，把 blocker 全部修掉。"*

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

运行 `demokiller init .` 后，支持 Skill 的 Agent 会获得 `/demokiller` 命令 — 自动触发生产就绪检查，优先处理 blocker，生成可执行的修复计划。

---

## 支持的项目类型

Demo Killer 检测 **26 种项目类型**，每种都有专属深度规则。

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
<strong>桌面应用</strong><br>
<sub>Electron, Tauri</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="36" height="36"><br>
<strong>移动应用</strong><br>
<sub>React Native, Flutter, Capacitor</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/unity/unity-original.svg" width="36" height="36"><br>
<strong>游戏</strong><br>
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
<sub>LLM agents, 工具调用, MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nginx/nginx-original.svg" width="36" height="36"><br>
<strong>API Gateway</strong><br>
<sub>Kong, Express Gateway, http-proxy</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/🌐-4285F4?style=flat-square&logo=googlechrome&logoColor=white" width="36" height="36"><br>
<strong>浏览器扩展</strong><br>
<sub>Chrome, Firefox, Manifest V3</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" width="36" height="36"><br>
<strong>IDE 插件</strong><br>
<sub>VS Code 扩展</sub>
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
<strong>数据库迁移</strong><br>
<sub>Knex, Prisma, TypeORM, Alembic</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/⏰-5BB552?style=flat-square&logo=clock&logoColor=white" width="36" height="36"><br>
<strong>定时任务</strong><br>
<sub>node-cron, Celery, APScheduler</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/⚡-FF9900?style=flat-square&logo=amazon&logoColor=white" width="36" height="36"><br>
<strong>Serverless</strong><br>
<sub>AWS Lambda, Vercel, Cloudflare</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/apachekafka/apachekafka-original.svg" width="36" height="36"><br>
<strong>消息队列</strong><br>
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
<strong>区块链</strong><br>
<sub>Solidity, ethers.js, web3.js</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/arduino/arduino-original.svg" width="36" height="36"><br>
<strong>IoT / 嵌入式</strong><br>
<sub>PlatformIO, Johnny-Five, Arduino</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg" width="36" height="36"><br>
<strong>DevOps 脚本</strong><br>
<sub>Shell, zx, 部署自动化</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/hugo/hugo-original.svg" width="36" height="36"><br>
<strong>静态站点</strong><br>
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
<strong>监控</strong><br>
<sub>Prometheus, Grafana, StatsD, Datadog</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/💳-635BFF?style=flat-square&logo=stripe&logoColor=white" width="36" height="36"><br>
<strong>支付系统</strong><br>
<sub>Stripe, PayPal, Square</sub>
</td>
<td align="center" width="12.5%">
<img src="https://img.shields.io/badge/🔐-009688?style=flat-square&logo=lock&logoColor=white" width="36" height="36"><br>
<strong>认证服务</strong><br>
<sub>Passport, NextAuth, Clerk, Auth.js</sub>
</td>
<td align="center" width="12.5%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg" width="36" height="36"><br>
<strong>系统级 C/C++</strong><br>
<sub>内核, 驱动, 原生应用, 嵌入式固件</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>每种类型在通用规则之上，额外获得 3-6 条专属深度规则。</sub>
</p>

---

## 支持的语言

Demo Killer 能分析 **18 种语言**，带语言感知解析。

<table>
<tr>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="32" height="32"><br>
<strong>TypeScript</strong><br>
<sub>✅ AST ✅ 调用图 ✅ 污点</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" width="32" height="32"><br>
<strong>JavaScript</strong><br>
<sub>✅ AST ✅ 调用图 ✅ 污点</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" width="32" height="32"><br>
<strong>Python</strong><br>
<sub>✅ AST ✅ BFS调用图 ✅ 污点</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg" width="32" height="32"><br>
<strong>Go</strong><br>
<sub>✅ AST ⚠️ 正则调用图</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-original.svg" width="32" height="32"><br>
<strong>Rust</strong><br>
<sub>✅ AST ⚠️ 正则调用图</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" width="32" height="32"><br>
<strong>Java</strong><br>
<sub>✅ AST ⚠️ 正则调用图</sub>
</td>
<td align="center" width="10%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg" width="32" height="32"><br>
<strong>C#</strong><br>
<sub>✅ AST ⚠️ 正则调用图</sub>
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

Demo Killer 作为 MCP 服务器运行，提供 3 个工具给 Agent：

| 工具 | 功能 |
|------|------|
| `inspect_project` | 完整审计，JSON 或 Markdown 输出 |
| `list_launch_blockers` | 只返回 blocker 级别发现 |
| `generate_hardening_plan` | 三阶段修复计划：blocker → 加固 → 改进 |

启动服务器：

```bash
npx demokiller-mcp
```

---

## CLI 命令

| 命令 | 用途 |
|------|------|
| `demokiller inspect .` | 完整生产就绪审计 |
| `demokiller inspect . --format markdown` | Markdown 输出，适合 PR |
| `demokiller inspect . --format sarif` | SARIF 输出，接 GitHub Code Scanning |
| `demokiller inspect . --severity blocker` | 只看上线阻塞项 |
| `demokiller inspect . --save-baseline .dk.json` | 保存当前状态为基线 |
| `demokiller recheck .` | 对比基线，只看新增问题 |
| `demokiller init .` | 脚手架生成 Agent 集成文件 |
| `demokiller benchmark benchmarks/list.json` | 跑 benchmark 套件 |

---

## vs. 其他工具

| | CodeQL | SonarQube | Semgrep | Snyk | **Demo Killer** |
|---|---|---|---|---|---|
| **目的** | 找漏洞 | 找代码坏味道 | 找模式 | 找依赖漏洞 | **找上线阻塞项** |
| **输出** | "47 个中等问题" | "D 评级" | "12 个发现" | "3 个高危" | **"Launch Blocked"** |
| **项目类型** | 通用 | 通用 | 通用 | 通用 | **26 种，类型专属规则** |
| **Agent 原生** | ❌ | ❌ | ❌ | ❌ | **✅ MCP, Skills, JSON, SARIF** |
| **结论** | 无 | 分数 | 无 | 无 | **4 级结论** |
| **后果说明** | 无 | 无 | 无 | 无 | **"忽略这个会怎样"** |
| **验收标准** | 无 | 无 | 无 | 无 | **"修好了长什么样"** |

CodeQL 告诉你代码有什么问题。**Demo Killer 告诉你项目能不能上线。**

---

## Roadmap

- 100+ 真实项目的系统性误报率测量
- 逐文件分析替换内容拼接（减少跨文件误报）
- Java、C#、PHP、Ruby 调用图支持
- 插件 API 支持自定义规则
- VS Code 扩展

---

## License

[MIT](LICENSE) — 随便用。

<p align="center">
  <sub>为真正要上线的人而造，不是为 demo 而造。</sub>
</p>
