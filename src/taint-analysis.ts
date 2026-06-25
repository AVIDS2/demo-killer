import type { CallGraph, CallSite, FuncDef } from "./call-graph.js";
import { resolveCallee, findCallers } from "./call-graph.js";

// ─── Taint sources and sinks ────────────────────────────────────

export interface TaintSource {
  pattern: string;
  kind: "user-input" | "env-var" | "external-api";
  description: string;
}

export interface TaintSink {
  pattern: string;
  kind: "code-exec" | "sql" | "command" | "http" | "file" | "response";
  severity: "blocker" | "high" | "medium";
  description: string;
}

export const TAINT_SOURCES: TaintSource[] = [
  { pattern: "req.body", kind: "user-input", description: "Request body" },
  { pattern: "req.params", kind: "user-input", description: "Route parameters" },
  { pattern: "req.query", kind: "user-input", description: "Query string" },
  { pattern: "request.json", kind: "user-input", description: "Parsed request body" },
  { pattern: "request.body", kind: "user-input", description: "Request body" },
  { pattern: "request.form", kind: "user-input", description: "Form data" },
  { pattern: "params.", kind: "user-input", description: "Path parameters" },
  { pattern: "c.Bind", kind: "user-input", description: "Go request binding" },
  { pattern: "c.ShouldBind", kind: "user-input", description: "Go request binding" },
  { pattern: "web::Json", kind: "user-input", description: "Rust JSON extractor" },
  { pattern: "@RequestBody", kind: "user-input", description: "Java request body" },
  { pattern: "input(", kind: "user-input", description: "Python input" },
  { pattern: "process.argv", kind: "user-input", description: "CLI arguments" },
  { pattern: "os.environ", kind: "env-var", description: "Environment variable" },
  { pattern: "process.env", kind: "env-var", description: "Environment variable" },
];

export const TAINT_SINKS: TaintSink[] = [
  { pattern: "eval", kind: "code-exec", severity: "blocker", description: "eval() code execution" },
  { pattern: "new Function", kind: "code-exec", severity: "blocker", description: "Function constructor" },
  { pattern: "exec", kind: "command", severity: "blocker", description: "Command execution" },
  { pattern: "execSync", kind: "command", severity: "blocker", description: "Sync command execution" },
  { pattern: "spawn", kind: "command", severity: "blocker", description: "Process spawn" },
  { pattern: "child_process", kind: "command", severity: "blocker", description: "Child process" },
  { pattern: "subprocess", kind: "command", severity: "blocker", description: "Python subprocess" },
  { pattern: "os.system", kind: "command", severity: "blocker", description: "Python os.system" },
  { pattern: "query", kind: "sql", severity: "blocker", description: "SQL query execution" },
  { pattern: "execute", kind: "sql", severity: "blocker", description: "SQL execution" },
  { pattern: "raw", kind: "sql", severity: "blocker", description: "Raw SQL query" },
  { pattern: "fetch", kind: "http", severity: "high", description: "HTTP request (SSRF risk)" },
  { pattern: "axios", kind: "http", severity: "high", description: "HTTP client" },
  { pattern: "requests.get", kind: "http", severity: "high", description: "Python HTTP request" },
  { pattern: "requests.post", kind: "http", severity: "high", description: "Python HTTP request" },
  { pattern: "readFile", kind: "file", severity: "high", description: "File read (path traversal)" },
  { pattern: "open(", kind: "file", severity: "high", description: "File open" },
  { pattern: "sendFile", kind: "file", severity: "high", description: "Send file to client" },
  { pattern: "response.json", kind: "response", severity: "medium", description: "Data sent to client" },
  { pattern: "Response.json", kind: "response", severity: "medium", description: "Data sent to client" },
  { pattern: "res.json", kind: "response", severity: "medium", description: "Data sent to client" },
  { pattern: "c.JSON", kind: "response", severity: "medium", description: "Data sent to client" },
  { pattern: "render json", kind: "response", severity: "medium", description: "Data sent to client" },
];

// ─── Taint finding ──────────────────────────────────────────────

export interface TaintPath {
  source: { pattern: string; kind: string; file: string; line: number };
  sink: { pattern: string; kind: string; severity: string; file: string; line: number };
  path: string[];
  risk: string;
}

// ─── Analysis ───────────────────────────────────────────────────

function isSourceCall(callee: string): TaintSource | undefined {
  return TAINT_SOURCES.find(s => callee.includes(s.pattern));
}

function isSinkCall(callee: string): TaintSink | undefined {
  return TAINT_SINKS.find(s => callee.includes(s.pattern));
}

function findDirectTaintPaths(graph: CallGraph): TaintPath[] {
  const results: TaintPath[] = [];
  const seen = new Set<string>();

  // For each call site, check if it's a sink
  for (const call of graph.calls) {
    const sink = isSinkCall(call.callee);
    if (!sink) continue;

    // Check if any source flows into this sink in the same function
    const funcCalls = graph.calls.filter(
      c => c.caller === call.caller && c.file === call.file
    );

    for (const otherCall of funcCalls) {
      const source = isSourceCall(otherCall.callee);
      if (!source) continue;

      // Source and sink are in the same function — potential taint flow
      const key = `${call.file}:${call.caller}:${source.pattern}:${sink.pattern}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Check if source call happens before sink call (line number heuristic)
      if (otherCall.line <= call.line) {
        results.push({
          source: { pattern: source.pattern, kind: source.kind, file: otherCall.file, line: otherCall.line },
          sink: { pattern: sink.pattern, kind: sink.kind, severity: sink.severity, file: call.file, line: call.line },
          path: [`${otherCall.file}:${otherCall.line}`, `${call.file}:${call.line}`],
          risk: `${source.description} → ${sink.description}`,
        });
      }
    }
  }

  return results;
}

function findCrossFunctionTaint(graph: CallGraph, maxDepth = 3): TaintPath[] {
  const results: TaintPath[] = [];
  const seen = new Set<string>();

  // Find functions that contain sink calls
  const sinkFuncs = new Map<string, { sink: TaintSink; call: CallSite }>();
  for (const call of graph.calls) {
    const sink = isSinkCall(call.callee);
    if (sink) {
      sinkFuncs.set(call.caller, { sink, call });
    }
  }

  // For each function that reads user input, check if it eventually reaches a sink
  for (const call of graph.calls) {
    const source = isSourceCall(call.callee);
    if (!source) continue;

    const sourceFunc = call.caller;
    // Check if this function directly calls a function that has a sink
    const callees = graph.calls.filter(c => c.caller === sourceFunc && c.file === call.file);

    for (const calleeCall of callees) {
      // Resolve to actual function
      const resolved = resolveCallee(graph, calleeCall);
      if (!resolved) continue;

      const resolvedKey = `${resolved.file}:${resolved.name}`;
      if (sinkFuncs.has(resolvedKey)) {
        const { sink, call: sinkCall } = sinkFuncs.get(resolvedKey)!;
        const key = `${call.file}:${source.pattern}:${resolvedKey}:${sink.pattern}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          source: { pattern: source.pattern, kind: source.kind, file: call.file, line: call.line },
          sink: { pattern: sink.pattern, kind: sink.kind, severity: sink.severity, file: sinkCall.file, line: sinkCall.line },
          path: [`${call.file}:${call.line}`, resolvedKey, `${sinkCall.file}:${sinkCall.line}`],
          risk: `${source.description} flows through ${resolved.name} → ${sink.description}`,
        });
      }
    }
  }

  return results;
}

export function analyzeTaint(graph: CallGraph): TaintPath[] {
  const direct = findDirectTaintPaths(graph);
  const crossFunction = findCrossFunctionTaint(graph);

  // Deduplicate
  const seen = new Set<string>();
  const all: TaintPath[] = [];
  for (const path of [...direct, ...crossFunction]) {
    const key = path.path.join("→");
    if (!seen.has(key)) {
      seen.add(key);
      all.push(path);
    }
  }

  return all;
}

// ─── Auth middleware verification ────────────────────────────────

export interface AuthGap {
  route: string;
  file: string;
  line: number;
  reason: string;
}

const AUTH_PATTERNS = [
  "auth", "authenticate", "requireAuth", "isAuthenticated",
  "protect", "guard", "middleware.auth", "verifyToken",
  "getServerSession", "currentUser", "login_required",
  "@login_required", "@PreAuthorize", "JWT", "HTTPBearer",
  "constructEvent", "signatureVerification", "STRIPE_WEBHOOK_SECRET",
];

export function findAuthGaps(graph: CallGraph, routeFiles: string[]): AuthGap[] {
  const gaps: AuthGap[] = [];

  for (const routeFile of routeFiles) {
    const funcs = Array.from(graph.functions.values()).filter(f => f.file === routeFile);

    for (const func of funcs) {
      // Check if this function is called by a route handler
      const callers = findCallers(graph, func.name);
      const isRouteHandler = func.name.toLowerCase().includes("handler") ||
        func.name.toLowerCase().includes("controller") ||
        func.name.toLowerCase().includes("route") ||
        routeFile.includes("route") || routeFile.includes("controller");

      if (!isRouteHandler) continue;

      // Check all calls in this file for auth patterns (not just this function's direct calls)
      const fileCalls = graph.calls.filter(c => c.file === routeFile);
      const hasAuth = fileCalls.some(c =>
        AUTH_PATTERNS.some(p => c.callee.toLowerCase().includes(p.toLowerCase()))
      );

      // Also check imports for auth-related modules
      const fileImports = graph.imports.filter(i => i.file === routeFile);
      const hasAuthImport = fileImports.some(i =>
        AUTH_PATTERNS.some(p => i.imported.toLowerCase().includes(p.toLowerCase())) ||
        AUTH_PATTERNS.some(p => i.source.toLowerCase().includes(p.toLowerCase()))
      );

      if (!hasAuth && !hasAuthImport) {
        gaps.push({
          route: func.name,
          file: routeFile,
          line: func.line,
          reason: "No authentication found in handler or its call chain",
        });
      }
    }
  }

  return gaps;
}
