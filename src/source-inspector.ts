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
  if (text.includes("openai") || text.includes("OpenAI") || text.includes("chat.completions")) {
    pushUnique(capabilities, "callsOpenAI");
  }
  if (text.includes("stripe") || text.includes("Stripe")) {
    pushUnique(capabilities, "handlesPaymentProvider");
  }
  if (text.includes("prisma.") && text.match(/\.\s*(delete|update|create|upsert)\s*\(/)) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (
    text.includes("prisma.") &&
    text.match(/\.\s*(findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow)\s*\(/)
  ) {
    pushUnique(capabilities, "readsDatabase");
  }
  if (
    text.match(/await\s+(request|req)\.json\s*\(/) ||
    text.match(/\b(request|req)\.body\b/) ||
    text.match(/\brequest\.json\s*\(/)
  ) {
    pushUnique(capabilities, "consumesRequestBody");
  }
}

function detectControlsFromText(text: string, controls: string[]) {
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
  if (text.includes("role") || text.includes("isAdmin") || text.includes("permission")) {
    pushUnique(controls, "authorization");
  }
  if (text.includes("rateLimit") || text.includes("limiter")) {
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
  if (
    text.match(/\bimport\b.*\bfrom\b.*['"]zod['"]/) ||
    text.match(/\bimport\b.*\bfrom\b.*['"]yup['"]/) ||
    text.match(/\bimport\b.*\bfrom\b.*['"]joi['"]/) ||
    text.match(/\brequire\s*\(\s*['"]zod['"]\s*\)/) ||
    text.match(/\brequire\s*\(\s*['"]yup['"]\s*\)/) ||
    text.match(/\brequire\s*\(\s*['"]joi['"]\s*\)/) ||
    text.match(/\.parse\s*\(/) ||
    text.match(/\.safeParse\s*\(/) ||
    text.match(/\.validate\s*\(/)
  ) {
    pushUnique(controls, "inputValidation");
  }
  if (text.match(/\.catch\s*\(/)) {
    pushUnique(controls, "errorHandling");
  }
  if (
    text.includes("Access-Control-Allow-Origin") ||
    text.match(/\bcors\s*\(\s*\)/) ||
    text.match(/\bcors\s*\(\s*\{\s*\}\s*\)/) ||
    text.match(/origin:\s*['"]?\*['"]?/)
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

  // Fallback: text-only detection for unknown file types
  const { promises: fs } = await import("node:fs");
  const text = await fs.readFile(fullPath, "utf8");

  detectCapabilitiesFromText(text, capabilities);
  detectControlsFromText(text, controls);
  const envVars = extractEnvVars(text);

  return { path: relativePath, capabilities, controls, envVars, line };
}
