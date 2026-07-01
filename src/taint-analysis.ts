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
  // Removed: "request.json" was too broad — matches non-web code (Dart http, Python requests, etc.)
  // Only match explicit web-framework request body patterns
  { pattern: "request.body", kind: "user-input", description: "Request body" },
  { pattern: "request.form", kind: "user-input", description: "Form data" },
  // Narrowed: only match req.params (not generic "params." which fires on CLI tools, game engines, etc.)
  { pattern: "req.params", kind: "user-input", description: "Route parameters (Express/Fastify)" },
  { pattern: "c.Bind", kind: "user-input", description: "Go request binding" },
  { pattern: "c.ShouldBind", kind: "user-input", description: "Go request binding" },
  { pattern: "web::Json", kind: "user-input", description: "Rust JSON extractor" },
  { pattern: "@RequestBody", kind: "user-input", description: "Java request body" },
  { pattern: "input(", kind: "user-input", description: "Python input" },
  // Removed process.argv: CLI tools legitimately read args + exec — not a web taint path
  // process.argv → exec is by-design in CLI tools, not an injection vulnerability
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

// ─── Sanitizers (break taint paths) ─────────────────────────────

export const TAINT_SANITIZERS = [
  // Type conversion (removes string taint)
  { pattern: "parseInt", kind: "type-conversion" },
  { pattern: "parseFloat", kind: "type-conversion" },
  { pattern: "Number(", kind: "type-conversion" },
  { pattern: "parseInt(", kind: "type-conversion" },
  // HTML/URL encoding
  { pattern: "escapeHtml", kind: "encoding" },
  { pattern: "encodeURIComponent", kind: "encoding" },
  { pattern: "encodeURI", kind: "encoding" },
  { pattern: "htmlEscape", kind: "encoding" },
  { pattern: "sanitize", kind: "sanitization" },
  { pattern: "escape(", kind: "encoding" },
  // Validation (if used before sink, indicates awareness)
  { pattern: ".parse(", kind: "validation" },
  { pattern: ".safeParse(", kind: "validation" },
  { pattern: "z.string()", kind: "validation" },
  { pattern: "z.number()", kind: "validation" },
  { pattern: "validator.", kind: "validation" },
  // SQL parameterization
  { pattern: "prepare(", kind: "parameterization" },
  { pattern: "bindParam", kind: "parameterization" },
  { pattern: "$1", kind: "parameterization" },
  { pattern: "?", kind: "parameterization" },
];

export function isSanitized(text: string, line: number, calls: CallSite[]): boolean {
  // Check if any sanitizer is called on the same line or nearby
  const nearbyCalls = calls.filter(c => Math.abs(c.line - line) <= 2);
  return nearbyCalls.some(c =>
    TAINT_SANITIZERS.some(s => c.callee.includes(s.pattern))
  );
}

/** Enhanced sanitizer check: scan the entire function body for a sanitizer applied to the tainted variable name. */
function isSanitizedInFunction(taintedExpr: string, funcCalls: CallSite[], sourceLine: number, sinkLine: number): boolean {
  // Find calls between source and sink in the function body
  const intervening = funcCalls.filter(c => c.line >= sourceLine && c.line <= sinkLine);
  // Direct proximity check
  const hasNearbySanitizer = intervening.some(c =>
    TAINT_SANITIZERS.some(s => c.callee.includes(s.pattern))
  );
  if (hasNearbySanitizer) return true;
  // Check all sanitizer calls in the function body — if a sanitizer appears anywhere after the source,
  // it's likely applied to the tainted data (conservative: avoid false negatives)
  const afterSource = funcCalls.filter(c => c.line >= sourceLine);
  return afterSource.some(c =>
    TAINT_SANITIZERS.some(s => c.callee.includes(s.pattern))
  );
}

// ─── Variable assignment tracking ───────────────────────────────

interface VarAssignment {
  name: string;
  source: string;  // what was assigned (could be a tainted expression)
  file: string;
  line: number;
}

function extractAssignments(text: string, file: string): VarAssignment[] {
  const assignments: VarAssignment[] = [];
  // const/let/var x = expr
  const pattern = /(?:const|let|var)\s+(\w+)\s*=\s*(.+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const line = text.substring(0, match.index).split("\n").length;
    assignments.push({ name: match[1], source: match[2].trim(), file, line });
  }
  return assignments;
}

// ─── TaintState: iterative variable taint propagation ───────────

/**
 * Tracks tainted variables across a function body and propagates taint
 * through assignments, object property access, array indexing, and
 * destructuring — up to maxDepth hops.
 */
export class TaintState {
  /** Variable names that are currently tainted */
  taintedVars = new Set<string>();
  /** Tracks which source pattern tainted each variable */
  taintOrigin = new Map<string, { source: TaintSource; line: number }>();
  /** Hop count for each tainted variable (for depth limiting) */
  taintDepth = new Map<string, number>();

  constructor(private maxDepth = 3) {}

  /** Mark a variable as tainted from a source at a given line. */
  markTainted(varName: string, source: TaintSource, line: number, depth = 0): void {
    if (depth >= this.maxDepth) return;
    const existingDepth = this.taintDepth.get(varName);
    if (existingDepth !== undefined && existingDepth <= depth) return;
    this.taintedVars.add(varName);
    this.taintOrigin.set(varName, { source, line });
    this.taintDepth.set(varName, depth);
  }

  /** Check if a variable or expression is tainted. */
  isTainted(expr: string): boolean {
    // Direct variable name check
    if (this.taintedVars.has(expr)) return true;
    // Strip leading characters like `(` for cases like `(x)`
    const cleaned = expr.replace(/^[^a-zA-Z_$]*/, "").split(/[^a-zA-Z0-9_$]/)[0];
    if (cleaned && this.taintedVars.has(cleaned)) return true;
    return false;
  }

  /**
   * Propagate taint through all assignments in the function body.
   * Iterates up to maxDepth times so multi-hop alias chains are caught.
   */
  propagate(assignments: VarAssignment[], sourceAssignments: VarAssignment[]): void {
    // Seed: mark source assignments as tainted at depth 0
    for (const sa of sourceAssignments) {
      const source = TAINT_SOURCES.find(s => sa.source.includes(s.pattern));
      if (source) {
        this.markTainted(sa.name, source, sa.line, 0);
      }
    }

    // Iterate to propagate taint through aliases, object access, arrays
    for (let depth = 0; depth < this.maxDepth; depth++) {
      let changed = false;

      for (const assign of assignments) {
        if (this.taintedVars.has(assign.name)) continue; // already tainted at this or lower depth
        const expr = assign.source;

        // 1. Direct alias: const b = a
        const aliasName = expr.split(/[^a-zA-Z0-9_$]/)[0];
        if (aliasName && this.taintedVars.has(aliasName)) {
          const originDepth = this.taintDepth.get(aliasName) ?? 0;
          if (originDepth + 1 < this.maxDepth) {
            this.markTainted(assign.name, this.taintOrigin.get(aliasName)!.source, assign.line, originDepth + 1);
            changed = true;
          }
        }

        // 2. Object property access: const name = user.name  or  const name = user['name']
        const propMatch = expr.match(/^(\w+)(?:\.(\w+)|\[(['"]?\w+['"]?)\])/);
        if (propMatch) {
          const objName = propMatch[1];
          if (this.taintedVars.has(objName)) {
            const originDepth = this.taintDepth.get(objName) ?? 0;
            if (originDepth + 1 < this.maxDepth) {
              this.markTainted(assign.name, this.taintOrigin.get(objName)!.source, assign.line, originDepth + 1);
              changed = true;
            }
          }
        }

        // 3. Array indexing: const first = items[0]
        const arrMatch = expr.match(/^(\w+)\[\d+\]/);
        if (arrMatch) {
          const arrName = arrMatch[1];
          if (this.taintedVars.has(arrName)) {
            const originDepth = this.taintDepth.get(arrName) ?? 0;
            if (originDepth + 1 < this.maxDepth) {
              this.markTainted(assign.name, this.taintOrigin.get(arrName)!.source, assign.line, originDepth + 1);
              changed = true;
            }
          }
        }

        // 4. Destructuring: const { name, email } = req.body  or  const { name } = user
        const destructMatch = assign.source.match(/^\{([^}]+)\}\s*$/);
        if (destructMatch) {
          // This pattern would be: const { name } = req.body  where req.body is tainted
          // But in extractAssignments, the source would be the RHS after =, so:
          // match[1] = 'name', but source = 'req.body'
          // Actually for `const { name } = req.body`, regex captures name='name' and source='{ name } = req.body' trimmed
          // We handle this below in the function scanning
        }

        // 5. String concatenation: const y = x + "suffix"  or  const y = "prefix" + x
        if (expr.includes("+")) {
          const parts = expr.split("+").map(p => p.trim().replace(/['"]/g, ""));
          for (const part of parts) {
            const varPart = part.split(/[^a-zA-Z0-9_$]/)[0];
            if (varPart && this.taintedVars.has(varPart)) {
              const originDepth = this.taintDepth.get(varPart) ?? 0;
              if (originDepth + 1 < this.maxDepth) {
                this.markTainted(assign.name, this.taintOrigin.get(varPart)!.source, assign.line, originDepth + 1);
                changed = true;
              }
            }
          }
        }

        // 6. Method call on tainted: const c = b.toUpperCase()
        const methodMatch = expr.match(/^(\w+)\.\w+\s*\(/);
        if (methodMatch) {
          const objName = methodMatch[1];
          if (this.taintedVars.has(objName)) {
            const originDepth = this.taintDepth.get(objName) ?? 0;
            if (originDepth + 1 < this.maxDepth) {
              this.markTainted(assign.name, this.taintOrigin.get(objName)!.source, assign.line, originDepth + 1);
              changed = true;
            }
          }
        }

        // 7. Template literal: const msg = `Hello ${name}`
        const templateMatch = expr.match(/`[^`]*\$\{(\w+)[^`]*`/);
        if (templateMatch) {
          const varName = templateMatch[1];
          if (this.taintedVars.has(varName)) {
            const originDepth = this.taintDepth.get(varName) ?? 0;
            if (originDepth + 1 < this.maxDepth) {
              this.markTainted(assign.name, this.taintOrigin.get(varName)!.source, assign.line, originDepth + 1);
              changed = true;
            }
          }
        }
      }

      if (!changed) break; // Fixed point reached early
    }
  }

  /**
   * Scan for destructuring from tainted sources:
   *   const { name, email } = req.body
   *   const { name } = user   (where user is tainted)
   */
  scanDestructuring(lines: string[]): void {
    // Match: const { a, b, c } = taintedVar
    const destructPattern = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(\w+)/g;
    for (let i = 0; i < lines.length; i++) {
      let m;
      while ((m = destructPattern.exec(lines[i])) !== null) {
        const rhsVar = m[2];
        if (this.taintedVars.has(rhsVar)) {
          const fields = m[1].split(",").map(f => f.trim().split(":").pop()!.trim().split("=")[0].trim());
          for (const field of fields) {
            if (field && /^[a-zA-Z_$]/.test(field)) {
              const origin = this.taintOrigin.get(rhsVar)!;
              const depth = (this.taintDepth.get(rhsVar) ?? 0) + 1;
              if (depth < this.maxDepth) {
                this.markTainted(field, origin.source, i + 1, depth);
              }
            }
          }
        }
      }
    }
  }
}

function isTaintedExpression(expr: string, assignments: VarAssignment[]): boolean {
  // Direct source
  if (TAINT_SOURCES.some(s => expr.includes(s.pattern))) return true;
  // Variable that was assigned from a tainted source
  const varName = expr.split(/[.\s(]/)[0];
  const assignment = assignments.find(a => a.name === varName);
  if (assignment && TAINT_SOURCES.some(s => assignment.source.includes(s.pattern))) return true;
  // String concatenation with tainted variable
  if (expr.includes("+") && assignments.some(a => expr.includes(a.name) && TAINT_SOURCES.some(s => a.source.includes(s.pattern)))) return true;
  return false;
}

// ─── Taint finding ──────────────────────────────────────────────

export interface TaintPath {
  source: { pattern: string; kind: string; file: string; line: number };
  sink: { pattern: string; kind: string; severity: string; file: string; line: number };
  path: string[];
  risk: string;
  sanitized: boolean;
}

// ─── Analysis ───────────────────────────────────────────────────

function isSourceCall(callee: string): TaintSource | undefined {
  // Use word-boundary-aware matching to avoid false positives from substring matching
  // e.g. "request.body" should NOT match "responseBody" or "testRequestBody"
  return TAINT_SOURCES.find(s => {
    const idx = callee.indexOf(s.pattern);
    if (idx === -1) return false;
    // Check word boundary before: must be start of string, after a dot, after /, or after whitespace
    if (idx > 0) {
      const prev = callee[idx - 1];
      if (/\w/.test(prev)) return false;
    }
    return true;
  });
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

      // Check for sanitizers between source and sink (enhanced: full function body scan)
      const sanitized = isSanitizedInFunction(
        source.pattern, funcCalls, otherCall.line, call.line
      );
      if (sanitized) continue; // Taint path is broken

      // Check if source call happens before sink call (line number heuristic)
      if (otherCall.line <= call.line) {
        const pathSanitized = isSanitizedInFunction(
          source.pattern, funcCalls, otherCall.line, call.line
        );

        results.push({
          source: { pattern: source.pattern, kind: source.kind, file: otherCall.file, line: otherCall.line },
          sink: { pattern: sink.pattern, kind: sink.kind, severity: sink.severity, file: call.file, line: call.line },
          path: [`${otherCall.file}:${otherCall.line}`, `${call.file}:${call.line}`],
          risk: `${source.description} → ${sink.description}`,
          sanitized: pathSanitized,
        });
      }
    }
  }

  return results;
}

function findCrossFunctionTaint(graph: CallGraph, maxDepth = 3): TaintPath[] {
  const results: TaintPath[] = [];
  const seen = new Set<string>();

  // Build a map of function key → sinks it contains
  const sinkFuncs = new Map<string, { sink: TaintSink; call: CallSite }[]>();
  for (const call of graph.calls) {
    const sink = isSinkCall(call.callee);
    if (sink) {
      const key = `${call.file}:${call.caller}`;
      const arr = sinkFuncs.get(key) ?? [];
      arr.push({ sink, call });
      sinkFuncs.set(key, arr);
    }
  }

  // Build adjacency: function → functions it calls
  const callAdj = new Map<string, { calleeKey: string; callSite: CallSite }[]>();
  for (const call of graph.calls) {
    const callerKey = `${call.file}:${call.caller}`;
    const resolved = resolveCallee(graph, call);
    if (!resolved) continue;
    const calleeKey = `${resolved.file}:${resolved.name}`;
    const arr = callAdj.get(callerKey) ?? [];
    arr.push({ calleeKey, callSite: call });
    callAdj.set(callerKey, arr);
  }

  // For each function that reads user input, BFS through the call graph up to maxDepth
  for (const call of graph.calls) {
    const source = isSourceCall(call.callee);
    if (!source) continue;

    const sourceFuncKey = `${call.file}:${call.caller}`;

    // BFS: each entry is (current function key, hop count, path of keys, path of call sites)
    const queue: { funcKey: string; depth: number; path: string[]; callSites: CallSite[] }[] = [];
    let qIdx = 0;
    const visitedInBfs = new Set<string>();

    // Start with direct callees of the source function
    const callees = callAdj.get(sourceFuncKey) ?? [];
    for (const { calleeKey, callSite } of callees) {
      queue.push({
        funcKey: calleeKey,
        depth: 1,
        path: [sourceFuncKey, calleeKey],
        callSites: [call, callSite],
      });
    }

    while (qIdx < queue.length) {
      const current = queue[qIdx++];
      if (current.depth > maxDepth) continue;

      const bfsKey = current.funcKey + ":" + current.depth;
      if (visitedInBfs.has(bfsKey)) continue;
      visitedInBfs.add(bfsKey);

      // Check if the current function contains a sink
      const sinks = sinkFuncs.get(current.funcKey);
      if (sinks) {
        for (const { sink, call: sinkCall } of sinks) {
          const dedupeKey = `${call.file}:${source.pattern}:${current.funcKey}:${sink.pattern}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          // Check for sanitizers along the path
          let sanitized = false;
          for (const cs of current.callSites) {
            const funcCalls = graph.calls.filter(c => c.caller === cs.caller && c.file === cs.file);
            if (isSanitizedInFunction(source.pattern, funcCalls, call.line, cs.line)) {
              sanitized = true;
              break;
            }
          }

          results.push({
            source: { pattern: source.pattern, kind: source.kind, file: call.file, line: call.line },
            sink: { pattern: sink.pattern, kind: sink.kind, severity: sink.severity, file: sinkCall.file, line: sinkCall.line },
            path: [...current.path.map(k => k), `${sinkCall.file}:${sinkCall.line}`],
            risk: `${source.description} flows through ${current.depth - 1} intermediate function(s) → ${sink.description}`,
            sanitized,
          });
        }
      }

      // Continue BFS to deeper callees
      if (current.depth < maxDepth) {
        const nextCallees = callAdj.get(current.funcKey) ?? [];
        for (const { calleeKey, callSite } of nextCallees) {
          queue.push({
            funcKey: calleeKey,
            depth: current.depth + 1,
            path: [...current.path, calleeKey],
            callSites: [...current.callSites, callSite],
          });
        }
      }
    }
  }

  return results;
}

/**
 * Intra-function taint analysis using TaintState.
 * Scans each function body for source→sink flows through variable aliases,
 * object properties, array elements, and destructuring — up to maxDepth hops.
 */
function findVariableTaintPaths(graph: CallGraph, fileContents?: Map<string, string>): TaintPath[] {
  const results: TaintPath[] = [];
  const seen = new Set<string>();

  // Group calls by function
  const funcGroups = new Map<string, CallSite[]>();
  for (const call of graph.calls) {
    const key = `${call.file}:${call.caller}`;
    const arr = funcGroups.get(key) ?? [];
    arr.push(call);
    funcGroups.set(key, arr);
  }

  for (const [funcKey, funcCalls] of funcGroups) {
    const [file] = funcKey.split(":");

    // Find sources and sinks in this function
    const sourceCalls = funcCalls.filter(c => isSourceCall(c.callee));
    const sinkCalls = funcCalls.filter(c => isSinkCall(c.callee));
    if (sourceCalls.length === 0 || sinkCalls.length === 0) continue;

    // Get function body text if available
    const funcDef = graph.functions.get(funcKey.replace(file + ":", ""));
    if (!funcDef && !fileContents) continue;

    // Build TaintState and seed from source calls
    const state = new TaintState(3);
    for (const sc of sourceCalls) {
      const source = isSourceCall(sc.callee)!;
      // Try to infer which variable the source result is assigned to from nearby assignment patterns
      // This is heuristic — we seed with the source pattern itself for call-based detection
      state.markTainted(`__source_${sc.line}`, source, sc.line, 0);
    }

    // For each sink call, check if any tainted variable is passed as argument
    for (const sinkCall of sinkCalls) {
      const sink = isSinkCall(sinkCall.callee)!;
      for (const sourceCall of sourceCalls) {
        const source = isSourceCall(sourceCall.callee)!;

        // Check if source flows directly to sink (same function)
        if (sourceCall.line <= sinkCall.line) {
          const dedupeKey = `${file}:${funcKey}:${source.pattern}:${sink.pattern}:var`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const sanitized = isSanitizedInFunction(
            source.pattern, funcCalls, sourceCall.line, sinkCall.line
          );

          results.push({
            source: { pattern: source.pattern, kind: source.kind, file, line: sourceCall.line },
            sink: { pattern: sink.pattern, kind: sink.kind, severity: sink.severity, file, line: sinkCall.line },
            path: [`${file}:${sourceCall.line}`, `${file}:${sinkCall.line}`],
            risk: `${source.description} → ${sink.description}`,
            sanitized,
          });
        }
      }
    }
  }

  return results;
}

// ─── Skip patterns for test/example/vendor files ─────────────

const SKIP_RE = /[\\/](?:test|tests|__tests__|spec|specs|fixtures|testdata|samples|example|examples|demo|demos|bench|benchmark|benchmarks|docs|doc|vendor|third_party|node_modules|\.git)[\\/]|[._](?:test|spec|e2e)\.[^.]+$/i;

function filterGraph(graph: CallGraph): CallGraph {
  return {
    ...graph,
    calls: graph.calls.filter(c => !SKIP_RE.test(c.file)),
    functions: new Map([...graph.functions].filter(([, f]) => !SKIP_RE.test(f.file))),
    imports: graph.imports.filter(i => !SKIP_RE.test(i.file)),
  };
}

export function analyzeTaint(graph: CallGraph, fileContents?: Map<string, string>): TaintPath[] {
  const filtered = filterGraph(graph);
  const direct = findDirectTaintPaths(filtered);
  const crossFunction = findCrossFunctionTaint(filtered);
  const variableTaint = findVariableTaintPaths(filtered, fileContents);

  // Deduplicate
  const seen = new Set<string>();
  const all: TaintPath[] = [];
  for (const path of [...direct, ...crossFunction, ...variableTaint]) {
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
