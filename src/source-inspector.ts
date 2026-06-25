import path from "node:path";
import { promises as fs } from "node:fs";

export interface RouteSourceEvidence {
  path: string;
  capabilities: string[];
  controls: string[];
  envVars: string[];
  line: number;
  metrics?: {
    complexity: number;
    functionCount: number;
    avgFunctionLength: number;
    longestFunction: number;
  };
}

// ─── Tree-sitter singleton ───────────────────────────────────────

let parser: any = null;
let ParserLib: any = null;
const languageCache = new Map<string, any>();

const WASM_DIR = "node_modules/tree-sitter-wasms/out";

const EXT_TO_GRAMMAR: Record<string, string> = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
  ".ts": "typescript", ".tsx": "tsx", ".mts": "typescript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c", ".h": "c",
  ".cpp": "cpp", ".cxx": "cpp", ".cc": "cpp", ".hpp": "cpp",
  ".cs": "c_sharp",
  ".php": "php",
  ".rb": "ruby",
  ".swift": "swift",
  ".lua": "lua",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".kt": "kotlin", ".kts": "kotlin",
  ".scala": "scala", ".sc": "scala",
  ".dart": "dart",
  ".zig": "zig",
  ".vue": "vue",
};

function getExt(filename: string): string {
  return path.extname(filename).toLowerCase();
}

async function getParser(): Promise<any> {
  if (parser) return parser;
  ParserLib = await import("web-tree-sitter");
  await ParserLib.Parser.init();
  parser = new ParserLib.Parser();
  return parser;
}

async function getLanguage(ext: string): Promise<any | null> {
  if (languageCache.has(ext)) return languageCache.get(ext);
  const grammarName = EXT_TO_GRAMMAR[ext];
  if (!grammarName) return null;
  try {
    const wasmPath = path.join(WASM_DIR, `tree-sitter-${grammarName}.wasm`);
    const lang = await ParserLib.Language.load(wasmPath);
    languageCache.set(ext, lang);
    return lang;
  } catch {
    return null;
  }
}

// ─── Text-based detection (language-agnostic) ────────────────────

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

function detectCapabilitiesFromText(text: string, capabilities: string[]) {
  if (text.includes("openai") || text.includes("OpenAI") || text.includes("chat.completions") || text.includes("openai-go") || text.includes("openai-java") || text.includes("openai-python")) {
    pushUnique(capabilities, "callsOpenAI");
  }
  if (text.includes("anthropic") || text.includes("Anthropic")) {
    pushUnique(capabilities, "callsAnthropic");
  }
  if (text.includes("stripe") || text.includes("Stripe")) {
    pushUnique(capabilities, "handlesPaymentProvider");
  }
  if (text.includes("prisma.") && text.match(/\.\s*(delete|update|create|upsert)\s*\(/)) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (text.includes("prisma.") && text.match(/\.\s*(findFirst|findMany|findUnique)\s*\(/)) {
    pushUnique(capabilities, "readsDatabase");
  }
  if (text.includes("session.add(") || text.includes("session.delete(") || text.includes("session.commit()") || text.includes(".objects.create(") || text.includes("db.session")) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (text.includes("session.query(") || text.includes(".objects.all()") || text.includes(".objects.get(") || text.includes("db.session.query")) {
    pushUnique(capabilities, "readsDatabase");
  }
  if (text.match(/\bdb\s*\.\s*(Create|Delete|Update|Save)\s*\(/)) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (text.match(/\bdb\s*\.\s*(Find|First|Take)\s*\(/)) {
    pushUnique(capabilities, "readsDatabase");
  }
  if (text.match(/await\s+(request|req)\.json\s*\(/) || text.match(/\b(request|req)\.body\b/) || text.match(/\brequest\.json\s*\(/) || text.match(/\brequest\.form\s*\(/)) {
    pushUnique(capabilities, "consumesRequestBody");
  }
  if (text.match(/\bc\s*\.\s*(ShouldBindJSON|Bind|BindJSON)\s*\(/)) {
    pushUnique(capabilities, "consumesRequestBody");
  }
  if (text.match(/\b(Json|web::Json|axum::Json)\s*\(/) || text.includes("Payload")) {
    pushUnique(capabilities, "consumesRequestBody");
  }
  if (text.includes("@RequestBody")) {
    pushUnique(capabilities, "consumesRequestBody");
  }
  if (text.match(/\b(exec|execSync|spawn|child_process)\s*\(/) || text.match(/\bsubprocess\.(run|Popen|call)\s*\(/) || text.match(/\bos\.system\s*\(/)) {
    pushUnique(capabilities, "commandExecution");
  }
  // N+1 query: database call inside a loop
  if (
    text.match(/\b(for\s*\(|while\s*\(|\.forEach\s*\(|\.map\s*\(|for\s+\w+\s+in)/) &&
    (text.match(/prisma\.\w+\.(find|delete|update|create|upsert)/i) || text.match(/\.(query|execute|raw)\s*\(/))
  ) {
    pushUnique(capabilities, "nPlusOneRisk");
  }

  // N+1 query detection: DB call inside a loop
  if (
    text.match(/for\s*\(.*\)\s*\{[\s\S]{0,500}(prisma|db|session|collection)\.\w+\.(find|query|get|select|where)\s*\(/) ||
    text.match(/\.map\s*\([\s\S]{0,300}(prisma|db|session)\.\w+\.(find|query|get)\s*\(/) ||
    text.match(/\.forEach\s*\([\s\S]{0,300}(prisma|db|session)\.\w+\.(find|query|get)\s*\(/) ||
    text.match(/for\s+\w+\s+in\s+[\s\S]{0,300}(prisma|db|session)\.\w+\.(find|query|get)\s*\(/) ||
    text.match(/while\s*\([\s\S]{0,300}(prisma|db|session)\.\w+\.(find|query|get)\s*\(/)
  ) {
    pushUnique(capabilities, "nPlusOneQuery");
  }

  // PII field exposure: DB result with PII fields returned directly
  if (
    (text.includes("email") || text.includes("phone") || text.includes("address") || text.includes("ssn") || text.includes("password")) &&
    (text.includes("prisma.") || text.includes("db.") || text.includes("User.") || text.includes("user.")) &&
    (text.match(/return.*(?:user|User|profile|Profile)/) || text.match(/res\.json\s*\(\s*(?:user|users|data)/) || text.match(/Response\.json\s*\(\s*(?:user|users)/))
  ) {
    pushUnique(capabilities, "piiExposure");
  }

  // ── Agent ecosystem ──────────────────────────────────────────────
  // LLM output → code execution
  if (
    text.match(/\beval\s*\(\s*(response|result|completion|output|message|content|llm|ai|answer)/) ||
    text.match(/\bnew\s+Function\s*\(\s*(response|result|completion|output|message|content)/) ||
    text.match(/\bexec\s*\(\s*(response|result|completion|output|message|content)/) ||
    text.match(/\bsubprocess\.\w+\s*\(\s*(response|result|completion|output)/) ||
    text.match(/\bos\.system\s*\(\s*(response|result|completion|output)/)
  ) {
    pushUnique(capabilities, "evaluatesLlmOutput");
  }

  // MCP server patterns
  if (
    text.includes("McpServer") || text.includes("mcpServer") ||
    text.includes("@modelcontextprotocol") || text.includes("mcp.createServer") ||
    text.includes("server.tool(") || text.includes("StdioServerTransport")
  ) {
    pushUnique(capabilities, "mcpServer");
  }

  // Agent tool definitions
  if (
    text.match(/server\s*\.\s*tool\s*\(/) ||
    text.match(/tool\s*\(\s*['"][\w-]+['"]/) ||
    text.includes("function_tools") || text.includes("tools:") ||
    text.match(/@\w+\.tool\s*\(/) || text.match(/@tool\s*\(/) ||
    text.includes("ChatCompletionTool") || text.includes("FunctionDefinition")
  ) {
    pushUnique(capabilities, "agentTool");
  }

  // Prompt injection risk — user input in prompt
  if (
    text.match(/system.*?prompt.*?\$\{.*?(input|user)/i) ||
    text.match(/f['"].*?\{.*?(input|user|message).*?\}.*prompt/i) ||
    text.match(/prompt\s*=\s*.*?\+\s*.*?(input|user|message)/i) ||
    text.match(/template\s*\(.*?(input|user|message).*?\)/i)
  ) {
    pushUnique(capabilities, "promptInjection");
  }

  // Context leak — system prompt or memory returned
  if (
    text.match(/return.*?(system.*?prompt|systemMessage|system_message)/i) ||
    text.match(/response.*?(system.*?prompt|systemMessage)/i) ||
    text.match(/json.*?(system.*?prompt|systemMessage)/i) ||
    text.includes("systemPrompt") && text.match(/return|response|json/i)
  ) {
    pushUnique(capabilities, "contextLeak");
  }
}

function detectControlsFromText(text: string, controls: string[]) {
  if (text.match(/\bauth\s*\(/) || text.includes("getServerSession") || text.includes("currentUser") || text.includes("req.user") || text.includes("passport.authenticate") || text.includes("verifyToken") || text.includes("authenticate(")) {
    pushUnique(controls, "auth");
  }
  if (text.includes("@login_required") || text.includes("Depends(get_current_user") || text.includes("jwt.decode") || text.includes("HTTPBearer") || text.includes("get_current_user")) {
    pushUnique(controls, "auth");
  }
  if (text.includes("middleware.Auth") || text.includes("JWT") || text.includes("session.Get(")) {
    pushUnique(controls, "auth");
  }
  if (text.includes("@PreAuthorize") || text.includes("@Secured") || text.includes("SecurityContext") || text.includes("@AuthenticationPrincipal")) {
    pushUnique(controls, "auth");
  }
  if (text.includes("Authorization") || text.includes("Bearer") || text.includes("Identity")) {
    pushUnique(controls, "auth");
  }
  if (text.includes("role") || text.includes("isAdmin") || text.includes("permission")) {
    pushUnique(controls, "authorization");
  }
  if (text.includes("rateLimit") || text.includes("limiter") || text.includes("slowapi") || text.includes("RateLimiter")) {
    pushUnique(controls, "rateLimit");
  }
  if (text.includes("quota") || text.includes("usageLimit") || text.includes("monthlyLimit")) {
    pushUnique(controls, "quota");
  }
  if (text.includes("constructEvent") || text.includes("STRIPE_WEBHOOK_SECRET")) {
    pushUnique(controls, "signatureVerification");
  }
  if (text.includes("idempotency") || text.includes("event.id")) {
    pushUnique(controls, "idempotency");
  }
  if (text.match(/\.parse\s*\(/) || text.match(/\.safeParse\s*\(/) || text.match(/\.validate\s*\(/) || text.match(/\.model_validate\s*\(/) || text.includes("BaseModel") || text.includes("Schema(") || text.includes("dataclass") || text.includes("validator.New") || text.includes("serde::Deserialize") || text.includes("@Valid") || text.includes("@NotNull")) {
    pushUnique(controls, "inputValidation");
  }
  if (text.match(/\.catch\s*\(/) || text.match(/\bexcept\b/) || text.match(/\btry:\s*$/m) || text.match(/\bif\s+err\s*!=\s*nil/) || text.includes("Result<") || text.match(/\bcatch\s*\(\s*\w+/) || text.includes("@ExceptionHandler")) {
    pushUnique(controls, "errorHandling");
  }
  if (text.includes("Access-Control-Allow-Origin") || text.match(/\bcors\s*\(\s*\)/) || text.match(/allow_origins\s*=\s*\[\s*['"]?\*['"]?\s*\]/)) {
    pushUnique(controls, "corsWildcard");
  }
  if (text.match(/\bfetch\s*\(\s*(req|request|body|params|query|url)/) || text.match(/\baxios\s*\.\s*(get|post)\s*\(\s*(req|request|body)/) || text.match(/\brequests\s*\.\s*(get|post)\s*\(\s*(req|request|body|url)/)) {
    pushUnique(controls, "ssrfRisk");
  }
  if (text.match(/['"]sk-[a-zA-Z0-9]{20,}['"]/) || text.match(/['"]sk_live_[a-zA-Z0-9]+['"]/) || text.match(/['"]AKIA[A-Z0-9]{16}['"]/) || text.match(/['"]ghp_[a-zA-Z0-9]{36}['"]/) || text.match(/['"]whsec_[a-zA-Z0-9]+['"]/)) {
    pushUnique(controls, "hardcodedSecrets");
  }
  if (text.match(/\.query\s*\(\s*["'`].*\$\{/) || text.match(/\.query\s*\(\s*["'`].*\+/) || text.match(/execute\s*\(\s*f["']/) || text.match(/\.query\s*\(\s*fmt\.Sprintf/) || text.match(/createQuery\s*\(\s*["'`].*\+/)) {
    pushUnique(controls, "sqlInjectionRisk");
  }
  if (text.match(/readFile\s*\(\s*(req|request|params|query|body)\./) || text.match(/readFile\s*\(\s*path\.join\s*\(\s*.*?(req|request|params)/) || text.match(/open\s*\(\s*(req|request|params|body)\./) || text.match(/sendFile\s*\(\s*(req|request|params)\./)) {
    pushUnique(controls, "pathTraversalRisk");
  }
  if (text.includes("Content-Security-Policy") || text.includes("helmet(") || text.includes("X-Frame-Options") || text.includes("X-Content-Type-Options")) {
    pushUnique(controls, "securityHeaders");
  }
  if (text.includes("Strict-Transport-Security") || text.includes("redirectHttps") || text.includes("forceSSL")) {
    pushUnique(controls, "httpsEnforcement");
  }
  if (text.match(/pickle\.loads?\s*\(/) || text.match(/yaml\.load\s*\(\s*[^,)]+\s*\)/) || text.match(/\beval\s*\(\s*(req|request|input|body|params)/) || text.match(/\bnew\s+Function\s*\(\s*(req|request|input)/)) {
    pushUnique(controls, "insecureDeserialization");
  }
  if (text.includes("structuredLog") || text.includes("JSON.stringify") || text.match(/log\.\w+\s*\([^)]*\{/) || text.match(/logger\.\w+\s*\([^)]*\{/) || text.match(/auditLog\s*\([^)]*\{/)) {
    pushUnique(controls, "logSanitization");
  }

  // Timeout handling
  if (
    text.includes("AbortController") || text.includes("AbortSignal") ||
    text.match(/timeout\s*[:=]\s*\d/) || text.includes("setTimeout") ||
    text.match(/\.timeout\s*\(/) || text.includes("signal:") ||
    text.includes("request_timeout") || text.includes("connect_timeout")
  ) {
    pushUnique(controls, "timeoutHandling");
  }

  // Connection pooling
  if (
    text.includes("connectionLimit") || text.includes("pool") ||
    text.includes("max_connections") || text.includes("poolSize") ||
    text.includes("pool_size") || text.match(/pool\s*[:=]\s*\d/)
  ) {
    pushUnique(controls, "connectionPooling");
  }

  // PII exposure
  if (
    text.match(/return.*\b(email|phone|ssn|social_security|credit_card|passport|address|dob|date_of_birth)\b/) ||
    text.match(/\.json\s*\(\s*\{\s*[^}]*\b(email|password|secret|token|ssn)\b/) ||
    text.match(/res\.send\s*\([^)]*\b(email|password|secret|token|ssn)\b/) ||
    text.match(/c\.JSON\s*\([^)]*\b(email|password|secret)\b/)
  ) {
    pushUnique(controls, "piiExposure");
  }
}

function extractEnvVars(text: string): string[] {
  return Array.from(text.matchAll(/(?:process\.env|os\.environ|os\.getenv|env\.var|ENV)\s*\(?['".]*([A-Z0-9_]+)/g)).map((m) => m[1]);
}

// ─── Tree-sitter AST detection ───────────────────────────────────

interface TreeNode {
  type: string;
  text: string;
  childCount: number;
  child(index: number): TreeNode | null;
  children: TreeNode[];
  descendantsOfType(type: string): TreeNode[];
  startPosition: { row: number; column: number };
}

function astDetectControls(tree: TreeNode, text: string, ext: string, controls: string[]) {
  // Logging detection via AST
  const calls = tree.descendantsOfType("call_expression") ?? [];
  const memberExprs = tree.descendantsOfType("member_expression") ?? [];

  for (const call of calls) {
    const callText = call.text;
    if (callText.match(/^(console|logger|log|logging|print|fmt|println|println!|dbg!|eprintln!|System\.out|System\.err|auditLog|structuredLog|winston|pino|bunyan|log4j|slog)\b/)) {
      pushUnique(controls, "logging");
    }
    if (callText.match(/^console\.(log|debug)\b/) || callText.match(/^fmt\.Print/) || callText.match(/^println!\s*\(/) || callText.match(/^dbg!\s*\(/) || callText.match(/^System\.out\.print/) || callText.match(/^print\s*\(/)) {
      pushUnique(controls, "debugStatements");
    }
  }

  // Try-catch / error handling via AST
  const tryStmts = tree.descendantsOfType("try_statement") ?? tree.descendantsOfType("try_with_items") ?? tree.descendantsOfType("try_expression") ?? [];
  if (tryStmts.length > 0) {
    pushUnique(controls, "errorHandling");
  }
  const catchClauses = tree.descendantsOfType("catch_clause") ?? tree.descendantsOfType("except_clause") ?? [];
  if (catchClauses.length > 0) {
    pushUnique(controls, "errorHandling");
  }
  // Go: if err != nil pattern
  if (ext === ".go" && text.match(/\bif\s+err\s*!=\s*nil/)) {
    pushUnique(controls, "errorHandling");
  }
  // Rust: Result type or ? operator
  if (ext === ".rs" && (text.includes("Result<") || text.match(/\?\s*;/m))) {
    pushUnique(controls, "errorHandling");
  }
}

function computeMetrics(tree: TreeNode): { complexity: number; functionCount: number; avgFunctionLength: number; longestFunction: number } {
  const funcTypes = ["function_declaration", "function_definition", "method_definition", "method_declaration", "function_item", "arrow_function", "function_expression", "function_item"];
  const funcs: number[] = [];

  for (const ftype of funcTypes) {
    for (const node of tree.descendantsOfType(ftype) ?? []) {
      funcs.push(node.text.split("\n").length);
    }
  }

  // Cyclomatic complexity: count branching nodes
  const branchTypes = ["if_statement", "if_expression", "else_clause", "for_statement", "for_in_statement", "while_statement", "match_expression", "switch_statement", "case_clause", "catch_clause", "except_clause", "conditional_expression", "binary_expression"];
  let complexity = 1;
  for (const btype of branchTypes) {
    complexity += (tree.descendantsOfType(btype) ?? []).length;
  }

  return {
    complexity,
    functionCount: funcs.length,
    avgFunctionLength: funcs.length > 0 ? Math.round(funcs.reduce((a, b) => a + b, 0) / funcs.length) : 0,
    longestFunction: funcs.length > 0 ? Math.max(...funcs) : 0,
  };
}

// ─── Python/Go/Rust/Java/C#/PHP/Ruby/Swift/Lua/Shell text fallback ──

function detectLanguageSpecific(text: string, ext: string, controls: string[]) {
  if (ext === ".py") {
    if (text.match(/\blogging\.(debug|info|warning|error)\s*\(/) || text.match(/\blogger\.(debug|info|warning|error)\s*\(/)) pushUnique(controls, "logging");
    if (text.match(/\bprint\s*\(/)) pushUnique(controls, "debugStatements");
  }
  if (ext === ".go") {
    if (text.match(/\blog\.\w+\s*\(/) || text.match(/\blogrus\.\w+\s*\(/) || text.match(/\bzap\.\w+\s*\(/)) pushUnique(controls, "logging");
    if (text.match(/\bfmt\.Print(ln|f)?\s*\(/)) pushUnique(controls, "debugStatements");
    if (text.match(/\bif\s+err\s*!=\s*nil/)) pushUnique(controls, "errorHandling");
  }
  if (ext === ".rs") {
    if (text.match(/\b(log|tracing)::\w+!/) || text.match(/\binfo!\s*\(/) || text.match(/\bwarn!\s*\(/)) pushUnique(controls, "logging");
    if (text.match(/\bprintln!\s*\(/) || text.match(/\bdbg!\s*\(/)) pushUnique(controls, "debugStatements");
    if (text.includes("Result<") || text.match(/\?\s*;/m)) pushUnique(controls, "errorHandling");
  }
  if (ext === ".java" || ext === ".kt" || ext === ".scala") {
    if (text.match(/\blogger?\.(debug|info|warn|error)\s*\(/) || text.match(/\bLOGGER?\.(debug|info|warn|error)\s*\(/)) pushUnique(controls, "logging");
    if (text.match(/\bSystem\.out\.print(ln)?\s*\(/)) pushUnique(controls, "debugStatements");
    if (text.match(/\bcatch\s*\(\s*\w+/)) pushUnique(controls, "errorHandling");
  }
  if (ext === ".cs") {
    if (text.match(/\b_logger\.(Log|LogInformation|LogWarning|LogError)\s*\(/) || text.includes("ILogger")) pushUnique(controls, "logging");
    if (text.match(/\bConsole\.Write(Line)?\s*\(/)) pushUnique(controls, "debugStatements");
  }
  if (ext === ".php") {
    if (text.match(/\b(error_log|syslog|Log::)\s*\(/)) pushUnique(controls, "logging");
    if (text.match(/\b(var_dump|print_r|echo)\s*\(/)) pushUnique(controls, "debugStatements");
  }
  if (ext === ".rb") {
    if (text.match(/\blogger\.(debug|info|warn|error)\s*\(/) || text.match(/\bRails\.logger/)) pushUnique(controls, "logging");
    if (text.match(/\bputs\s+/)) pushUnique(controls, "debugStatements");
  }
  if (ext === ".swift") {
    if (text.match(/\bprint\s*\(/)) pushUnique(controls, "debugStatements");
  }
  if (ext === ".lua") {
    if (text.match(/\bprint\s*\(/)) pushUnique(controls, "debugStatements");
  }
  if (ext === ".sh" || ext === ".bash" || ext === ".zsh") {
    if (text.match(/\becho\s+/)) pushUnique(controls, "debugStatements");
  }
}

// ─── Public API ──────────────────────────────────────────────────

export async function inspectRouteSource(root: string, relativePath: string): Promise<RouteSourceEvidence> {
  const fullPath = path.join(root, relativePath);
  const ext = getExt(relativePath);
  const text = await fs.readFile(fullPath, "utf8");
  const capabilities: string[] = [];
  const controls: string[] = [];
  let line = 1;
  let metrics: RouteSourceEvidence["metrics"];

  // Text-based detection (always runs, language-agnostic)
  detectCapabilitiesFromText(text, capabilities);
  detectControlsFromText(text, controls);
  const envVars = extractEnvVars(text);

  // Language-specific text fallback
  detectLanguageSpecific(text, ext, controls);

  // Tree-sitter AST detection (when grammar available)
  try {
    const p = await getParser();
    const lang = await getLanguage(ext);
    if (lang) {
      p.setLanguage(lang);
      const tree = p.parse(text);
      const rootNode = tree.rootNode as unknown as TreeNode;

      // Update line from first function
      const funcTypes = ["function_declaration", "function_definition", "method_definition", "method_declaration", "function_item", "arrow_function"];
      for (const ftype of funcTypes) {
        const funcs = rootNode.descendantsOfType(ftype) ?? [];
        if (funcs.length > 0) {
          line = funcs[0].startPosition.row + 1;
          break;
        }
      }

      astDetectControls(rootNode, text, ext, controls);
      metrics = computeMetrics(rootNode);
    }
  } catch {
    // tree-sitter failed, text-based detection still works
  }

  return { path: relativePath, capabilities, controls, envVars, line, metrics };
}

export async function initTreeSitter(): Promise<void> {
  await getParser();
}
