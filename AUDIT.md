# Demo Killer 开发审计文档

<!-- 最后更新: 2026-06-27 -->
<!-- 当前版本: v0.5.5 -->

---

## 一、诚实定位

**Demo Killer 目前是一个"深度不均的生产就绪检查器"，不是"生产就绪闸门"。**

它能做：基于 155 条规则 + 文本模式 + JS/TS/Python/Go/Rust AST + 调用图 + 污点分析 + 项目类型感知路由 + SARIF 输出 + baseline/suppression，覆盖全部 25 种项目类型的深度检查（未知类型有通用规则），含 Python/Go/Rust tree-sitter AST + Agent/MCP 规则 + 14 种新增项目类型深度规则。
它不能做：理解系统架构、推导未知风险、验证业务正确性、运行时行为推断。

一个资深工程师认真审查 30 分钟，能发现的问题仍比 Demo Killer 多，但差距正在缩小。

---

## 二、覆盖度矩阵（诚实版）

### 2.1 项目类型覆盖

| 项目类型 | 检测 | 专用规则 | 深度分析 | 综合 |
|---------|------|---------|---------|------|
| web-app | ✅ 检测到 | ✅ 25+ 条 | ⚠️ 调用图/污点 (JS/TS) | **65%** |
| cli-tool | ✅ 检测到 | ✅ 6 条 (DK-CLI-001~006) | ⚠️ 入口扫描 | **40%** |
| library-sdk | ✅ 检测到 | ✅ 6 条 (DK-LIB-001~006) | ⚠️ package.json + tsconfig | **40%** |
| mq-worker | ✅ 检测到 | ✅ 6 条 (DK-MQ-001~006) | ⚠️ 源码扫描 | **40%** |
| iac | ✅ 检测到 | ✅ 6 条 (DK-IAC-001~006) | ⚠️ TF/YAML 扫描 | **40%** |
| payment-system | ✅ 检测到 | ✅ 4 条 (DK-PAY-001~004) | ⚠️ 源码扫描 | **35%** |
| auth-service | ✅ 检测到 | ✅ 4 条 (DK-AUTHSVC-001~004) | ⚠️ 源码扫描 | **35%** |
| desktop-app | ✅ 检测到 | ✅ 4 条 (DK-DESK-001~004) | ⚠️ 源码扫描 | **35%** |
| mobile-app | ✅ 检测到 | ✅ 4 条 (DK-MOB-001~004) | ⚠️ RN/Flutter/Capacitor 源码扫描 | **35%** |
| agent-mcp | ✅ 检测到 | ✅ 6 条 (DK-AGENT-006~011) | ⚠️ 源码扫描 | **35%** |
| python-api | ✅ 检测到 | ✅ 7 条 (DK-PY-001~007) | ⚠️ tree-sitter AST + 文本模式 | **35%** |
| game | ✅ 检测到 | ✅ 4 条 (DK-GAME-001~004) | ⚠️ 源码扫描 | **30%** |
| ml-pipeline | ✅ 检测到 | ✅ 4 条 (DK-ML-001~004) | ⚠️ 源码扫描 | **30%** |
| browser-extension | ✅ 检测到 | ✅ 3 条 (DK-EXT-001~003) | ⚠️ 源码扫描 | **30%** |
| ide-plugin | ✅ 检测到 | ✅ 3 条 (DK-IDE-001~003) | ⚠️ 源码扫描 | **30%** |
| cicd-pipeline | ✅ 检测到 | ✅ 3 条 (DK-CICD-001~003) | ⚠️ YAML/配置扫描 | **30%** |
| migration-tool | ✅ 检测到 | ✅ 3 条 (DK-MIG-001~003) | ⚠️ 源码扫描 | **30%** |
| api-gateway | ✅ 检测到 | ✅ 4 条 (DK-APIGW-001~004) | ⚠️ 源码扫描 | **30%** |
| cron-job | ✅ 检测到 | ✅ 4 条 (DK-CRON-001~004) | ⚠️ 源码扫描 | **35%** |
| wasm-module | ✅ 检测到 | ✅ 3 条 (DK-WASM-001~003) | ⚠️ 源码扫描 | **30%** |
| blockchain | ✅ 检测到 | ✅ 4 条 (DK-CHAIN-001~004) | ⚠️ Solidity/JS 源码扫描 | **30%** |
| iot-embedded | ✅ 检测到 | ✅ 4 条 (DK-IOT-001~004) | ⚠️ C/嵌入式源码扫描 | **30%** |
| devops-script | ✅ 检测到 | ✅ 4 条 (DK-DEVOPS-001~004) | ⚠️ Shell 脚本扫描 | **30%** |
| serverless-func | ✅ 检测到 | ✅ 4 条 (DK-SLS-001~004) | ⚠️ 源码扫描 | **35%** |
| static-site | ✅ 检测到 | ✅ 4 条 (DK-STATIC-001~004) | ⚠️ HTML/配置扫描 | **30%** |
| cms | ✅ 检测到 | ✅ 3 条 (DK-CMS-001~003) | ⚠️ 源码扫描 | **30%** |
| monitoring-tool | ✅ 检测到 | ✅ 4 条 (DK-MON-001~004) | ⚠️ 源码扫描 | **30%** |
| unknown | — | ⚠️ 通用规则 (DK-UNIVERSAL-001) | ❌ 无 | **5%** |

**深度覆盖: 26/26 (100%) — 所有可检测项目类型均有专用深度规则**

### 2.2 语言覆盖

| 语言 | 检测 | AST 解析 | Fixture | 深度 |
|------|------|---------|---------|------|
| TypeScript | ✅ | ✅ ts-morph | ✅ 3 fixtures | **70%** |
| JavaScript | ⚠️ 回退文本 | ❌ | ✅ 2 fixtures (cli, mq) | **35%** |
| Python | ✅ | ⚠️ 文本回退 (tree-sitter 可选) | ✅ 2 fixtures (risky, hardened) | **30%** |
| Go | ✅ | ⚠️ tree-sitter (go-call-graph.ts) | ✅ 1 fixture | **30%** |
| Rust | ✅ | ⚠️ tree-sitter (rust-call-graph.ts) | ✅ 1 fixture | **30%** |
| Java | ✅ | ❌ 文本回退 | ✅ 1 fixture | **15%** |
| Kotlin | ✅ | ❌ 文本回退 | ⚠️ fixture 无 route | **10%** |
| C# | ✅ | ❌ 文本回退 | ✅ 1 fixture | **15%** |
| PHP | ✅ | ❌ 文本回退 | ✅ 1 fixture | **15%** |
| Ruby | ✅ | ❌ 文本回退 | ✅ 1 fixture | **15%** |
| Swift | ✅ | ❌ 文本回退 | ✅ 1 fixture | **15%** |
| Dart | ✅ | ❌ 文本回退 | ⚠️ fixture 无 route | **10%** |
| C/C++ | ⚠️ 扩展名检测 | ❌ | ⚠️ fixture 无 route | **5%** |
| Lua/Shell/Zig | ✅ pattern 已定义 | ❌ | ❌ | **5%** |
| Scala | ✅ pattern 已定义 | ❌ | ❌ | **5%** |

**综合覆盖率: ~20%**

### 2.3 分析深度

| 层级 | 名称 | 描述 | 当前完成度 |
|------|------|------|-----------|
| L0 | 文本模式匹配 | 正则/关键字匹配 | ✅ 100% |
| L1 | AST 解析 | tree-sitter 语法树遍历 | ⚠️ JS/TS + Python/Go/Rust (tree-sitter) |
| L2 | 跨文件调用图 | 导入解析 + 函数调用链 | ⚠️ JS/TS, ~60% |
| L3 | 数据流追踪 | 污点源→传播→终点 | ⚠️ 同函数 30%, 跨函数 10% |
| L4 | 变量级追踪 | 赋值传播追踪 | ⚠️ 基础集成 |
| L5 | 业务逻辑 | 幂等/事务/并发/状态机 | ⚠️ 4 条模式规则 + 源码扫描 |
| L6 | 系统理解 | 架构推理+未知风险推导 | ❌ 0% |
| L7 | 运行时推断 | N+1/内存/并发行为 | ❌ 0% |

**综合完成度: ~20%**

---

## 三、当前规则审计

### 3.1 规则统计

| 深度 | 规则数 | 规则 ID |
|------|--------|---------|
| L0 文本 | 21 | CSP-001, HTTPS-001, DEBUG-001, CORS-001, SECRET-001, ENV-001, DB-001, TEST-001, TYPES-001, README-001, PUBLISH-001, OPS-001/002, INPUT-001, ERR-001, LOGI-001, AGENT-002/003/004/005, N-PLUS-ONE |
| L1 AST | 8 | AI-001, AUTH-001, WEBHOOK-001, OBS-001, DATA-001, AGENT-001, CMDI-001, SSRF-001 |
| L2 调用图 | 8 | TAINT-001, AUTHCHAIN-001, SQLI-001, PATH-001, INSEC-001, PERF-001/002, DATA-002 |
| L3 数据流 | 4 | TAINT-001(部分), BIZ-001/002/003 |
| **L0 项目深度** | **109** | CLI-001~006, LIB-001~006, MQ-001~006, IAC-001~006, PAY-001~004, AUTHSVC-001~004, CRON-001~004, SLS-001~004, DESK-001~004, MOB-001~004, PY-001~007, AGENT-006~011, GAME-001~004, ML-001~004, EXT-001~003, IDE-001~003, CICD-001~003, MIG-001~003, APIGW-001~004, WASM-001~003, CHAIN-001~004, IOT-001~004, DEVOPS-001~004, STATIC-001~004, CMS-001~003, MON-001~004 |
| L4 变量 | 0 | - |
| L5 业务 | 4 | BIZ-001/002/003/004（仍基于模式） |

**总计: 155 条规则**

### 3.2 Codex 对抗性审查 (v0.5.3)

本次使用 OpenAI Codex CLI (GPT-5.5) 对 v0.5.2 → v0.5.3 的完整 diff 进行对抗性审查，发现 4 个真实 bug：

| 优先级 | Bug | 根因 | 影响 |
|--------|-----|------|------|
| **P1** | `walkSourceFiles` 返回绝对路径，`readFileContent` 拼接后路径错误 | 6 个深度扫描器的 `results.push(full)` 传了绝对路径 | 所有深度扫描器在 Windows 上静默读空内容 |
| **P1** | `project-kind` 检测顺序错误 | `express` 被 web-framework 先匹配，`stripe+express` 无法识别为 payment-system | 领域项目被误判为通用 web-app |
| **P2** | PCI 检测自相矛盾 | `hasPCIAwareness` 包含 `card_number`/`cvv`，与 `storesCardData` 相同 | `storesCardData && !hasPCIAwareness` 永远为 false |
| **P2** | Session 安全误判 | `/httpOnly/i` 匹配注释和 `httpOnly: false` | 存在不安全配置却报告安全 |

**修复：**
- `walkSourceFiles` 改用 `path.relative(root, full)`（6 个文件）
- `project-kind.ts` 领域检测（payment/auth/blockchain）移到 web framework 之前
- `payment-auth.ts` PCI 检测移除与 card data 重叠的关键字
- `payment-auth.ts` Session 检测改为只匹配启用值（`true`/`1`）

### 3.3 本次修复的误报问题

| 问题 | 修复 |
|------|------|
| contextLeak 运算符优先级 bug | 加括号修复 |
| auth 检测过宽 (Authorization/Bearer) | 限定到函数调用/中间件上下文 |
| agentTool 检测匹配 `tools:` 和 `FunctionDefinition` | 移除过宽模式，增加上下文限制 |
| circuitBreaker 检测 `fallback` 过宽 | 限定到 `fallback()` 函数调用 |
| graceful-shutdown/health-check 无脑触发 | 改为实际扫描源码 |
| project-kind: prisma/typeorm 被误判为 migration-tool | 从检测中移除 |
| project-kind: playwright/cypress 被误判为 cicd-pipeline | 从检测中移除 |
| publicAiRouteRule 只检查 OpenAI | 增加 Anthropic 支持 |
| env-contract 不处理 export 前缀 | 添加 export 前缀清理 |
| cli.ts supportedStacks 三处重复 | 提取为共享常量 |

### 3.4 误报风险（更新后）

| 风险等级 | 规则 |
|---------|------|
| 高误报 | CSP-001, HTTPS-001, PERF-002, OPS-001/002 (已改善), BIZ-003/004 |
| 中误报 | ERR-001, LOGI-001, CMDI-001, SSRF-001, TAINT-001, PERF-001, INPUT-001 (源码 inspector 未识别 Go binding 验证) |
| 低误报 | AI-001, AUTH-001, WEBHOOK-001, SECRET-001, DB-001, DEP-001, AGENT-001, CLI-*, LIB-*, MQ-*, IAC-*, PAY-*, AUTHSVC-*, MOB-*, PY-*, AGENT-006~011 |

---

## 四、与竞品对比

| 维度 | CodeQL | SonarQube | Semgrep | Snyk | Demo Killer |
|------|--------|-----------|---------|------|-------------|
| AST 解析 | ✅ | ✅ | ✅ | ✅ | ⚠️ JS/TS + Python/Go/Rust (tree-sitter) |
| 调用图 | ✅ | ✅ | ✅ Pro | ✅ | ⚠️ 60% |
| 数据流 | ✅ 全局 | ✅ 跨函数 | ✅ Pro | ✅ | ⚠️ 30% |
| 语言覆盖 | 10+ | 30+ | 30+ | 10+ | 18 |
| 项目类型 | ⚠️ 偏安全 | ⚠️ 偏质量 | ⚠️ 偏安全 | ⚠️ 偏安全 | ✅ 26 种 (全部深度) |
| 生产就绪 | ❌ | ❌ | ❌ | ❌ | ✅ 26 种类型深度 |
| Agent 生态 | ❌ | ❌ | ❌ | ❌ | ✅ 独有 (DK-AGENT-*) |
| SARIF | ✅ | ✅ Pro | ✅ | ✅ | ✅ 2.1.0 |
| Baseline/diff | ✅ | ✅ | ❌ | ✅ | ✅ 指纹基线 |
| Mobile | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ DK-MOB-* |
| 开源 | 查询语言 | 社区版 | OSS | 商业 | ✅ MIT |

**Demo Killer 优势: 项目类型广度 + Agent 生态覆盖 + 生产就绪定位 + 全部 26 种类型深度规则。**

---

## 五、开发路线图

### Phase 1: ✅ 已完成 (v0.5.2)

| 任务 | 状态 |
|------|------|
| CLI 工具深度规则 (DK-CLI-001~006) | ✅ |
| Library/SDK 深度规则 (DK-LIB-001~006) | ✅ |
| MQ Worker 深度规则 (DK-MQ-001~006) | ✅ |
| IaC 深度规则 (DK-IAC-001~006) | ✅ |
| Payment System 深度规则 (DK-PAY-001~004) | ✅ |
| Auth Service 深度规则 (DK-AUTHSVC-001~004) | ✅ |
| source-inspector 误报修复 | ✅ |
| ops 规则实际扫描代码 | ✅ |
| project-kind 误分类修复 | ✅ |
| Anthropic API 支持 | ✅ |
| 新 fixture (MQ, IaC, Payment, Auth) | ✅ |

### Phase 2: ✅ 大部分完成 (v0.5.3)

| 任务 | 状态 |
|------|------|
| Cron Job 深度规则 (DK-CRON-001~004) | ✅ |
| Serverless Function 深度规则 (DK-SLS-001~004) | ✅ |
| Desktop App 深度规则 (DK-DESK-001~004) | ✅ |
| 项目类型感知路由 (CSP/HTTPS/CORS 仅限 web) | ✅ |
| N+1 检测从全文→函数级 | ✅ |
| 误报率置信度调整 (SSRF/CMDI → low) | ✅ |
| 负面测试覆盖 (6 个新断言) | ✅ |
| project-kind: serverless/IaC 检测修复 | ✅ |

### Phase 3: ✅ 已完成 (v0.5.4)

| 任务 | 状态 |
|------|------|
| Python 深度规则 (DK-PY-001~006) | ✅ 文本模式 + python-taint.ts |
| Python 调用图 (tree-sitter AST) | ✅ python-call-graph.ts (可选，未集成) |
| Mobile App 深度规则 (DK-MOB-001~004) | ✅ RN/Flutter/Capacitor |
| Agent/MCP 深度规则 (DK-AGENT-006~011) | ✅ 工具白名单/注入/泄露/循环/文件 |
| SARIF 2.1.0 输出 | ✅ GitHub Code Scanning 集成 |
| Baseline/suppression 支持 | ✅ 指纹基线 + 内联注释抑制 |
| projectKind 架构 bug 修复 | ✅ inventory.ts:453 移除三元强制 web-app |
| Codex 对抗性审查 | ✅ 4 个 bug 发现并修复 |
| 新 fixtures | ✅ python-risky, agent-risky, 4 hardened |
| 新测试 | ✅ baseline.test.ts, false-positive.test.ts, sarif.test.ts |

### Phase 4: ✅ 已完成 (v0.5.5)

| 任务 | 状态 |
|------|------|
| 14 种新增项目类型深度规则 (game/ml/browser-ext/ide/cicd/migration/apigw/wasm/blockchain/iot/devops/static/cms/monitoring) | ✅ 51 条新规则 |
| Go AST 分析 (tree-sitter-go) | ✅ go-call-graph.ts |
| Rust AST 分析 (tree-sitter-rust) | ✅ rust-call-graph.ts |
| Python 调用图集成到 python-taint.ts | ✅ tree-sitter 可选增强 |
| 项目类型检测全覆盖 (26/26) | ✅ api-gateway/ide-plugin/cicd-pipeline/migration-tool/wasm-module/iot-embedded/devops-script/monitoring-tool/cms |
| devops-script 规则实现（非 stub） | ✅ DK-DEVOPS-001~004 |
| migration-tool regex 误报修复 | ✅ 注释中 exports.down 不再触发 + knex API 匹配 |
| CMS fixture 修复（rule 代码误写为 fixture） | ✅ |
| cicd-pipeline fixture 路径修复 | ✅ .github/workflows 结构 |
| 14 个新 fixture + 14 个新测试 | ✅ 全部通过 |

---

## 六、关键指标

| 指标 | 之前 | 当前 | 目标 (v1.0) |
|------|------|------|-------------|
| 规则总数 | 46 | **155** | 200+ |
| 项目类型深度覆盖 | 2/26 (8%) | **26/26 (100%)** | 26/26 (100%) |
| 语言 AST 覆盖 | 1/18 (6%) | **4/18 (22%)** | 8/18 (44%) |
| 分析深度 L4+ | 0% | ~5% | 30% |
| 误报率 (预估) | ~40% | **~15%** | <15% |
| fixture 覆盖语言 | 6/18 | **10/18** | 14/18 |
| 测试数量 | 77 | **123** | 200+ |
| 竞品对齐度 | ~20% | **~32%** | ~60% |
