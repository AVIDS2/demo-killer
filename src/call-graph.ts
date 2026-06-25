import { promises as fs } from "node:fs";
import path from "node:path";

// ─── Types ──────────────────────────────────────────────────────

export interface FuncDef {
  name: string;
  file: string;
  line: number;
  params: string[];
  bodyRange: { start: number; end: number };
}

export interface CallSite {
  caller: string;      // qualified name: "file.ts:funcName"
  callee: string;      // unresolved name: "prisma.user.delete" or "sendChat"
  file: string;
  line: number;
  argCount: number;
}

export interface ImportInfo {
  file: string;
  imported: string;     // local name
  source: string;       // module specifier: "./services/chat"
  resolved?: string;    // resolved file path
}

export interface CallGraph {
  functions: Map<string, FuncDef>;       // "file.ts:funcName" → def
  calls: CallSite[];
  imports: ImportInfo[];
  fileIndex: Map<string, string>;        // basename → full relative path
}

// ─── Regex-based extraction (fast, no AST dependency) ───────────

const FUNC_PATTERNS = [
  // export async function foo(
  /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
  // const foo = async (
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?:=>|{)/g,
  // const foo = async function(
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/g,
  // Python: def foo(
  /def\s+(\w+)\s*\(([^)]*)\)/g,
  // Go: func foo(
  /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/g,
  // Rust: fn foo(
  /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g,
  // Java/C#: public static void foo(
  /(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?\w+\s+(\w+)\s*\(([^)]*)\)/g,
];

const IMPORT_PATTERNS = [
  // import { foo } from './bar'
  /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
  // import foo from './bar'
  /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
  // import * as foo from './bar'
  /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
  // const foo = require('./bar')
  /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Python: from bar import foo
  /from\s+(\S+)\s+import\s+(.+)/g,
];

const CALL_PATTERN = /(\w+(?:\.\w+)*)\s*\(/g;

const JS_TS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

// ─── File scanning ──────────────────────────────────────────────

async function walkSourceFiles(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  const skip = new Set(["node_modules", ".next", "dist", "build", "target", "__pycache__", ".venv", "venv", "vendor"]);

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkSourceFiles(root, fullPath)));
    } else {
      const rel = path.relative(root, fullPath).replaceAll("\\", "/");
      if (/\.(ts|tsx|js|jsx|mts|mjs|py|go|rs|java|cs|rb|php)$/.test(rel)) {
        result.push(rel);
      }
    }
  }
  return result;
}

// ─── Import resolution ──────────────────────────────────────────

function buildFileIndex(files: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    index.set(base, file);
    // Also index by directory path without extension
    const noExt = file.replace(/\.[^.]+$/, "");
    index.set(noExt, file);
    // Index "index" files
    if (base === "index") {
      const dir = path.dirname(file);
      index.set(dir, file);
      index.set(dir + "/index", file);
    }
  }
  return index;
}

function resolveImport(source: string, currentFile: string, fileIndex: Map<string, string>): string | undefined {
  // Skip non-relative imports (npm packages)
  if (!source.startsWith(".") && !source.startsWith("/") && !source.startsWith("@")) {
    return undefined;
  }

  const currentDir = path.dirname(currentFile);
  const resolved = path.join(currentDir, source).replaceAll("\\", "/");

  // Try exact match
  if (fileIndex.has(resolved)) return fileIndex.get(resolved);

  // Try with extensions
  for (const ext of JS_TS_EXTS) {
    const withExt = resolved + ext;
    if (fileIndex.has(withExt)) return fileIndex.get(withExt);
  }

  // Try index file
  const indexFile = resolved + "/index";
  if (fileIndex.has(indexFile)) return fileIndex.get(indexFile);
  for (const ext of JS_TS_EXTS) {
    if (fileIndex.has(indexFile + ext)) return fileIndex.get(indexFile + ext);
  }

  return undefined;
}

// ─── Extraction ─────────────────────────────────────────────────

function extractFunctions(text: string, file: string): FuncDef[] {
  const funcs: FuncDef[] = [];
  const seen = new Set<string>();

  for (const pattern of FUNC_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const params = (match[2] ?? "").split(",").map(p => p.trim().split(/[\s:=]/)[0]).filter(Boolean);
      const line = text.substring(0, match.index).split("\n").length;
      funcs.push({ name, file, line, params, bodyRange: { start: match.index, end: match.index + match[0].length } });
    }
  }
  return funcs;
}

function extractImports(text: string, file: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // ES6 imports: import { a, b } from './mod'
  const es6Pattern = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Pattern.exec(text)) !== null) {
    const names = match[1].split(",").map(n => n.trim().split(/\s+as\s+/)[0].trim());
    for (const name of names) {
      if (name) imports.push({ file, imported: name, source: match[2] });
    }
  }

  // Default import: import foo from './mod'
  const defaultPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = defaultPattern.exec(text)) !== null) {
    imports.push({ file, imported: match[1], source: match[2] });
  }

  // Python: from mod import a, b
  const pyPattern = /from\s+(\S+)\s+import\s+(.+)/g;
  while ((match = pyPattern.exec(text)) !== null) {
    const names = match[2].split(",").map(n => n.trim().split(/\s+as\s+/)[0].trim());
    for (const name of names) {
      if (name && name !== "*") imports.push({ file, imported: name, source: match[1] });
    }
  }

  return imports;
}

function extractCalls(text: string, file: string): CallSite[] {
  const calls: CallSite[] = [];
  const funcStarts = new Map<number, string>();

  // Find function boundaries to determine caller
  for (const pattern of FUNC_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      funcStarts.set(match.index, match[1]);
    }
  }

  // Find all call expressions
  const callRegex = /(\w+(?:\.\w+)*)\s*\(/g;
  let match;
  while ((match = callRegex.exec(text)) !== null) {
    const callee = match[1];
    // Skip keywords and common non-calls
    if (/^(if|for|while|switch|catch|return|typeof|instanceof|new|await|async|import|export|from|const|let|var|function|class|extends|implements|interface|type|enum)$/.test(callee)) continue;

    const line = text.substring(0, match.index).split("\n").length;

    // Find which function this call is inside
    let caller = "<module>";
    let bestStart = -1;
    for (const [start, name] of funcStarts) {
      if (start < match.index && start > bestStart) {
        bestStart = start;
        caller = name;
      }
    }

    const argCount = countArgs(text, match.index + match[0].length);
    calls.push({ caller: `${file}:${caller}`, callee, file, line, argCount });
  }

  return calls;
}

function countArgs(text: string, openParenPos: number): number {
  let depth = 1;
  let count = 1;
  let pos = openParenPos;
  while (pos < text.length && depth > 0) {
    const ch = text[pos];
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) break; }
    else if (ch === "," && depth === 1) count++;
    else if (ch === "'" || ch === '"' || ch === "`") {
      // Skip string literals
      const quote = ch;
      pos++;
      while (pos < text.length && text[pos] !== quote) {
        if (text[pos] === "\\") pos++;
        pos++;
      }
    }
    pos++;
  }
  return count;
}

// ─── Graph builder ──────────────────────────────────────────────

export async function buildCallGraph(root: string): Promise<CallGraph> {
  const files = await walkSourceFiles(root);
  const fileIndex = buildFileIndex(files);
  const functions = new Map<string, FuncDef>();
  const allCalls: CallSite[] = [];
  const allImports: ImportInfo[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(path.join(root, file), "utf8");
    } catch { continue; }

    // Extract functions
    for (const func of extractFunctions(text, file)) {
      const qualified = `${file}:${func.name}`;
      functions.set(qualified, func);
    }

    // Extract imports and resolve
    const imports = extractImports(text, file);
    for (const imp of imports) {
      imp.resolved = resolveImport(imp.source, file, fileIndex);
      allImports.push(imp);
    }

    // Extract calls
    allCalls.push(...extractCalls(text, file));
  }

  return { functions, calls: allCalls, imports: allImports, fileIndex };
}

// ─── Analysis queries ───────────────────────────────────────────

export function findCallers(graph: CallGraph, funcName: string): CallSite[] {
  return graph.calls.filter(c => c.callee === funcName || c.callee.endsWith("." + funcName));
}

export function findCallees(graph: CallGraph, callerName: string): CallSite[] {
  return graph.calls.filter(c => c.caller === callerName || c.caller.endsWith(":" + callerName));
}

export function resolveCallee(graph: CallGraph, call: CallSite): FuncDef | undefined {
  const sameFile = `${call.file}:${call.callee}`;
  if (graph.functions.has(sameFile)) return graph.functions.get(sameFile);

  const importMatch = graph.imports.find(
    i => i.file === call.file && i.imported === call.callee && i.resolved
  );
  if (importMatch?.resolved) {
    const resolved = `${importMatch.resolved}:${call.callee}`;
    if (graph.functions.has(resolved)) return graph.functions.get(resolved);
  }

  if (call.callee.includes(".")) {
    const objName = call.callee.split(".")[0];
    const objImport = graph.imports.find(
      i => i.file === call.file && i.imported === objName && i.resolved
    );
    if (objImport?.resolved) {
      return { name: call.callee, file: objImport.resolved, line: 0, params: [], bodyRange: { start: 0, end: 0 } };
    }
  }

  return undefined;
}

// ─── Entry point analysis ───────────────────────────────────────

export interface EntryPoint {
  func: FuncDef;
  qualified: string;
  kind: "route-handler" | "controller" | "middleware" | "worker" | "unknown";
}

export function identifyEntryPoints(graph: CallGraph, routeFiles: string[]): EntryPoint[] {
  const entries: EntryPoint[] = [];
  const routeFileSet = new Set(routeFiles);

  for (const [qualified, func] of graph.functions) {
    const file = func.file;
    const name = func.name.toLowerCase();

    // Route file functions are entry points
    if (routeFileSet.has(file)) {
      const kind = name.includes("handler") || name.includes("controller") || name.includes("route")
        ? "route-handler"
        : name.includes("middleware") ? "middleware"
        : name.includes("worker") || name.includes("job") ? "worker"
        : "route-handler"; // default for route files
      entries.push({ func, qualified, kind });
      continue;
    }

    // Controller files
    if (file.includes("controller") || file.includes("handler")) {
      entries.push({ func, qualified, kind: "controller" });
      continue;
    }

    // Exported functions in route-like files
    if (file.includes("routes/") || file.includes("api/")) {
      entries.push({ func, qualified, kind: "route-handler" });
    }
  }

  return entries;
}

export function traceFromEntryPoint(
  graph: CallGraph,
  entry: EntryPoint,
  maxDepth = 5,
): { callees: CallSite[]; depth: number }[] {
  const visited = new Set<string>();
  const result: { callees: CallSite[]; depth: number }[] = [];

  function walk(qualified: string, depth: number) {
    if (depth > maxDepth) return;
    if (visited.has(qualified)) return;
    visited.add(qualified);

    const callees = findCallees(graph, qualified.split(":")[1] || qualified);
    if (callees.length > 0) {
      result.push({ callees, depth });
      for (const call of callees) {
        const resolved = resolveCallee(graph, call);
        if (resolved) {
          walk(`${resolved.file}:${resolved.name}`, depth + 1);
        }
      }
    }
  }

  walk(entry.qualified, 0);
  return result;
}

// ─── Reachability analysis ──────────────────────────────────────

export function isReachableFrom(
  graph: CallGraph,
  targetFunc: string,
  fromEntry: string,
  maxDepth = 5,
): boolean {
  const visited = new Set<string>();

  function walk(current: string, depth: number): boolean {
    if (depth > maxDepth) return false;
    if (visited.has(current)) return false;
    visited.add(current);

    if (current === targetFunc) return true;

    const callees = findCallees(graph, current.split(":")[1] || current);
    for (const call of callees) {
      const resolved = resolveCallee(graph, call);
      if (resolved && walk(`${resolved.file}:${resolved.name}`, depth + 1)) {
        return true;
      }
    }
    return false;
  }

  return walk(fromEntry, 0);
}

export function traceCallChain(graph: CallGraph, startFile: string, startFunc: string, maxDepth = 5): string[][] {
  const chains: string[][] = [];
  const visited = new Set<string>();

  function walk(current: string, chain: string[], depth: number) {
    if (depth > maxDepth) return;
    if (visited.has(current)) return;
    visited.add(current);

    const callees = findCallees(graph, current);
    if (callees.length === 0) {
      chains.push([...chain]);
      return;
    }

    for (const call of callees) {
      const resolved = resolveCallee(graph, call);
      if (resolved) {
        const next = `${resolved.file}:${resolved.name}`;
        walk(next, [...chain, next], depth + 1);
      } else {
        // External or unresolved call
        chains.push([...chain, `<external:${call.callee}>`]);
      }
    }
  }

  const start = `${startFile}:${startFunc}`;
  walk(start, [start], 0);
  return chains;
}

export function findPathsToSinks(
  graph: CallGraph,
  sources: string[],
  sinks: string[],
  maxDepth = 5,
): Array<{ source: string; sink: string; path: string[] }> {
  const results: Array<{ source: string; sink: string; path: string[] }> = [];

  for (const call of graph.calls) {
    // Check if this call is a source
    const isSource = sources.some(s => call.callee.includes(s));
    if (!isSource) continue;

    // Trace from this source to find sinks
    const chains = traceCallChain(graph, call.file, call.caller.split(":")[1] || call.caller, maxDepth);
    for (const chain of chains) {
      const lastNode = chain[chain.length - 1];
      if (sinks.some(s => lastNode.includes(s))) {
        results.push({ source: call.callee, sink: lastNode, path: chain });
      }
    }
  }

  return results;
}
