import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";

export interface RouteSourceEvidence {
  path: string;
  capabilities: string[];
  controls: string[];
  envVars: string[];
  line: number;
}

// ─── Language-agnostic text-based detection ────────────────────────

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

function detectCapabilitiesFromText(text: string, capabilities: string[]) {
  // AI/ML providers
  if (text.includes("openai") || text.includes("OpenAI") || text.includes("chat.completions")) {
    pushUnique(capabilities, "callsOpenAI");
  }
  if (text.includes("anthropic") || text.includes("Anthropic")) {
    pushUnique(capabilities, "callsAnthropic");
  }

  // Payment providers
  if (text.includes("stripe") || text.includes("Stripe")) {
    pushUnique(capabilities, "handlesPaymentProvider");
  }

  // Database mutations
  if (text.includes("prisma.") && text.match(/\.\s*(delete|update|create|upsert)\s*\(/)) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (
    text.includes("prisma.") &&
    text.match(/\.\s*(findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow)\s*\(/)
  ) {
    pushUnique(capabilities, "readsDatabase");
  }
  // Python ORM: SQLAlchemy, Django ORM — require Python-specific markers
  if (
    (text.includes("session.add(") || text.includes("session.delete(") || text.includes("session.commit()") ||
     text.includes(".objects.create(") || text.includes(".objects.filter(") || text.includes("db.session"))
  ) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (
    (text.includes("session.query(") || text.includes(".objects.all()") || text.includes(".objects.get(") ||
     text.includes("db.session.query") || text.includes("select("))
  ) {
    pushUnique(capabilities, "readsDatabase");
  }

  // Request body consumption
  if (
    text.match(/await\s+(request|req)\.json\s*\(/) ||
    text.match(/\b(request|req)\.body\b/) ||
    text.match(/\brequest\.json\s*\(/) ||
    text.match(/\bawait\s+request\.json\s*\(\s*\)/) ||
    text.match(/\brequest\.form\s*\(/) ||
    text.match(/\bawait\s+request\.form\s*\(\s*\)/)
  ) {
    pushUnique(capabilities, "consumesRequestBody");
  }
  // Python: Pydantic model as function parameter (FastAPI pattern)
  if (text.match(/:\s*[A-Z]\w+\s*[,)]/) && (text.includes("BaseModel") || text.includes("Schema"))) {
    pushUnique(capabilities, "consumesRequestBody");
  }
}

function detectControlsFromText(text: string, controls: string[]) {
  // Auth — JS/TS
  if (
    text.match(/\bauth\s*\(/) ||
    text.includes("getServerSession") ||
    text.includes("currentUser") ||
    text.includes("req.user") ||
    text.includes("req.isAuthenticated") ||
    text.includes("passport.authenticate") ||
    text.includes("verifyToken") ||
    text.includes("authenticate(")
  ) {
    pushUnique(controls, "auth");
  }
  // Auth — Python
  if (
    text.includes("@login_required") ||
    text.includes("Depends(get_current_user") ||
    text.includes("current_user") ||
    text.includes("login_user") ||
    text.includes("jwt.decode") ||
    text.includes("verify_jwt") ||
    text.includes("TokenAuth") ||
    text.includes("HTTPBearer") ||
    text.includes("APIKeyHeader") ||
    text.includes("get_current_user") ||
    text.includes("Permission") ||
    text.includes("permissions_classes")
  ) {
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

  // Input validation — JS/TS + Python
  if (
    text.match(/\bimport\b.*\bfrom\b.*['"]zod['"]/) ||
    text.match(/\bimport\b.*\bfrom\b.*['"]yup['"]/) ||
    text.match(/\bimport\b.*\bfrom\b.*['"]joi['"]/) ||
    text.match(/\brequire\s*\(\s*['"]zod['"]\s*\)/) ||
    text.match(/\brequire\s*\(\s*['"]yup['"]\s*\)/) ||
    text.match(/\brequire\s*\(\s*['"]joi['"]\s*\)/) ||
    text.includes("BaseModel") || // Pydantic
    text.includes("Schema(") || // Marshmallow
    text.includes("dataclass") ||
    text.match(/\.parse\s*\(/) ||
    text.match(/\.safeParse\s*\(/) ||
    text.match(/\.validate\s*\(/) ||
    text.match(/\.model_validate\s*\(/)
  ) {
    pushUnique(controls, "inputValidation");
  }

  // Error handling — JS + Python
  if (text.match(/\.catch\s*\(/) || text.match(/\bexcept\b/) || text.match(/\btry:\s*$/m)) {
    pushUnique(controls, "errorHandling");
  }

  if (
    text.includes("Access-Control-Allow-Origin") ||
    text.match(/\bcors\s*\(\s*\)/) ||
    text.match(/\bcors\s*\(\s*\{\s*\}\s*\)/) ||
    text.match(/origin:\s*['"]?\*['"]?/) ||
    text.includes("CORSMiddleware") ||
    text.match(/allow_origins\s*=\s*\[\s*['"]?\*['"]?\s*\]/)
  ) {
    pushUnique(controls, "corsWildcard");
  }
}

function extractEnvVars(text: string): string[] {
  return Array.from(text.matchAll(/(?:process\.env|os\.environ|os\.getenv)\s*\(?['".]*([A-Z0-9_]+)/g)).map(
    (match) => match[1],
  );
}

// ─── TypeScript/JavaScript AST detection (ts-morph) ───────────────

function detectFromJsTsAst(
  text: string,
  sourceFile: ReturnType<InstanceType<typeof Project>["addSourceFileAtPath"]>,
  controls: string[],
  line: number): number {
  const firstFunction = sourceFile.getFunctions()[0];
  const detectedLine = firstFunction?.getStartLineNumber() ?? line;

  if (
    sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => {
        const t = call.getText();
        return (
          t.startsWith("console.") ||
          t.startsWith("logger.") ||
          t.startsWith("log.") ||
          t.startsWith("auditLog") ||
          t.startsWith("structuredLog")
        );
      })
  ) {
    pushUnique(controls, "logging");
  }
  if (sourceFile.getDescendantsOfKind(SyntaxKind.TryStatement).length > 0) {
    pushUnique(controls, "errorHandling");
  }
  if (
    sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => {
        const t = call.getText();
        return t.startsWith("console.log") || t.startsWith("console.debug");
      })
  ) {
    pushUnique(controls, "debugStatements");
  }

  return detectedLine;
}

// ─── Public API ───────────────────────────────────────────────────

const JS_TS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

export async function inspectRouteSource(
  root: string,
  relativePath: string,
): Promise<RouteSourceEvidence> {
  const fullPath = path.join(root, relativePath);
  const ext = path.extname(relativePath);
  const capabilities: string[] = [];
  const controls: string[] = [];
  let line = 1;

  if (JS_TS_EXTS.includes(ext)) {
    const project = new Project({ useInMemoryFileSystem: false });
    const sourceFile = project.addSourceFileAtPath(fullPath);
    const text = sourceFile.getFullText();

    detectCapabilitiesFromText(text, capabilities);
    detectControlsFromText(text, controls);
    const envVars = extractEnvVars(text);
    line = detectFromJsTsAst(text, sourceFile, controls, line);

    return { path: relativePath, capabilities, controls, envVars, line };
  }

  // Fallback: text-only detection for unknown file types (including Python)
  const { promises: fs } = await import("node:fs");
  const text = await fs.readFile(fullPath, "utf8");

  detectCapabilitiesFromText(text, capabilities);
  detectControlsFromText(text, controls);
  const envVars = extractEnvVars(text);

  // Python-specific AST-like text detections
  if (ext === ".py") {
    if (text.match(/\blogging\.(debug|info|warning|error|critical)\s*\(/) || text.match(/\blogger\.(debug|info|warning|error|critical)\s*\(/)) {
      pushUnique(controls, "logging");
    }
    if (text.match(/\bprint\s*\(/)) {
      pushUnique(controls, "debugStatements");
    }
    if (text.match(/\bexcept\s+/) || text.match(/\btry:\s*$/m)) {
      pushUnique(controls, "errorHandling");
    }
  }

  return { path: relativePath, capabilities, controls, envVars, line };
}
