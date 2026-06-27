import { promises as fs } from "node:fs";
import path from "node:path";

// ─── Types ──────────────────────────────────────────────────────

export interface GoFuncDef {
  name: string;
  file: string;
  line: number;
  params: string[];
  receiver?: string;       // e.g. "(s *Server)" method receiver
  isMethod: boolean;
  isExported: boolean;
  bodyRange: { startRow: number; endRow: number };
}

export interface GoCallSite {
  caller: string;      // "file.go:funcName"
  callee: string;      // e.g. "http.HandleFunc" or "handleLogin"
  file: string;
  line: number;
  argCount: number;
}

export interface GoImportInfo {
  file: string;
  imported: string;     // local alias or package name
  source: string;       // import path: "net/http", "github.com/gin-gonic/gin"
  resolved?: string;    // resolved file path (for local imports only)
}

export interface GoRoute {
  method: string;       // GET, POST, PUT, DELETE, PATCH
  path: string;         // e.g. "/api/users"
  handler: string;      // function name
  framework: string;    // "gin", "echo", "fiber", "net-http"
  file: string;
  line: number;
}

export interface GoCallGraph {
  functions: Map<string, GoFuncDef>;
  calls: GoCallSite[];
  imports: GoImportInfo[];
  routes: GoRoute[];
  fileIndex: Map<string, string>;
}

// ─── Tree-sitter singleton (WASM-based) ────────────────────────

let parser: any = null;
let ParserLib: any = null;
let goLang: any = null;

const WASM_DIR = "node_modules/tree-sitter-wasms/out";

async function getParser(): Promise<any> {
  if (parser) return parser;
  const mod = await import("web-tree-sitter");
  ParserLib = mod.Parser ? mod : mod.default ?? mod;
  await ParserLib.Parser.init();
  parser = new ParserLib.Parser();
  return parser;
}

async function getGoLanguage(): Promise<any> {
  if (goLang) return goLang;
  const p = await getParser();
  const wasmPath = path.join(WASM_DIR, "tree-sitter-go.wasm");
  goLang = await ParserLib.Language.load(wasmPath);
  p.setLanguage(goLang);
  return goLang;
}

// ─── AST node helpers ───────────────────────────────────────────

interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child(index: number): TSNode | null;
  children: TSNode[];
  namedChildren: TSNode[];
  parent: TSNode | null;
  fieldNameForChild(index: number): string | null;
  descendantsOfType(type: string | string[]): TSNode[];
}

function getChildByFieldName(node: TSNode, name: string): TSNode | null {
  for (let i = 0; i < node.childCount; i++) {
    if (node.fieldNameForChild(i) === name) {
      return node.child(i);
    }
  }
  return null;
}

// ─── File walking ───────────────────────────────────────────────

async function walkGoFiles(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  const skip = new Set([
    "node_modules", ".next", "dist", "build", "target",
    "__pycache__", ".venv", "venv", ".git", "vendor",
  ]);

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkGoFiles(root, fullPath)));
    } else if (entry.name.endsWith(".go")) {
      result.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }
  return result;
}

// ─── AST extraction ─────────────────────────────────────────────

/**
 * Extract function and method declarations from a Go AST.
 * Go node types:
 *   function_declaration   → func foo(...)
 *   method_declaration     → func (r *Receiver) foo(...)
 */
function extractFunctions(rootNode: TSNode, file: string): GoFuncDef[] {
  const funcs: GoFuncDef[] = [];

  // Regular function declarations
  const funcDecls = rootNode.descendantsOfType("function_declaration") ?? [];
  for (const node of funcDecls) {
    const nameNode = getChildByFieldName(node, "name");
    if (!nameNode) continue;

    const paramsNode = getChildByFieldName(node, "parameters");
    const params = extractParamNames(paramsNode);
    const isExported = /^[A-Z]/.test(nameNode.text);

    funcs.push({
      name: nameNode.text,
      file,
      line: node.startPosition.row + 1,
      params,
      isMethod: false,
      isExported,
      bodyRange: {
        startRow: node.startPosition.row,
        endRow: node.endPosition.row,
      },
    });
  }

  // Method declarations (with receiver)
  const methodDecls = rootNode.descendantsOfType("method_declaration") ?? [];
  for (const node of methodDecls) {
    const nameNode = getChildByFieldName(node, "name");
    if (!nameNode) continue;

    const paramsNode = getChildByFieldName(node, "parameters");
    const params = extractParamNames(paramsNode);
    const isExported = /^[A-Z]/.test(nameNode.text);

    // Extract receiver type
    const receiverNode = getChildByFieldName(node, "receiver");
    let receiver: string | undefined;
    if (receiverNode) {
      // Receiver looks like "(s *Server)" — extract the type name
      const receiverText = receiverNode.text;
      const typeMatch = receiverText.match(/[*]?(\w+)\s*\)?$/);
      receiver = typeMatch ? typeMatch[1] : receiverText;
    }

    funcs.push({
      name: nameNode.text,
      file,
      line: node.startPosition.row + 1,
      params,
      receiver,
      isMethod: true,
      isExported,
      bodyRange: {
        startRow: node.startPosition.row,
        endRow: node.endPosition.row,
      },
    });
  }

  return funcs;
}

function extractParamNames(paramsNode: TSNode | null): string[] {
  const params: string[] = [];
  if (!paramsNode) return params;

  for (const param of paramsNode.namedChildren) {
    if (param.type === "parameter_declaration") {
      // Each param_decl may have multiple identifiers (e.g. "x, y int")
      for (const child of param.namedChildren) {
        if (child.type === "identifier") {
          params.push(child.text);
        }
      }
    } else if (param.type === "variadic_parameter_declaration") {
      for (const child of param.namedChildren) {
        if (child.type === "identifier") {
          params.push(child.text);
        }
      }
    }
  }
  return params;
}

/**
 * Extract call expressions. Go uses `call_expression` nodes.
 */
function extractCalls(rootNode: TSNode, file: string, funcs: GoFuncDef[]): GoCallSite[] {
  const calls: GoCallSite[] = [];
  const callNodes = rootNode.descendantsOfType("call_expression") ?? [];

  for (const callNode of callNodes) {
    const funcNode = getChildByFieldName(callNode, "function");
    if (!funcNode) continue;

    const callee = funcNode.text;
    const line = callNode.startPosition.row + 1;

    // Skip Go keywords that look like calls
    if (/^(make|len|cap|append|copy|delete|new|close|panic|recover|real|imag|complex|print|println)$/.test(callee)) {
      continue;
    }

    // Count arguments
    const argsNode = getChildByFieldName(callNode, "arguments");
    let argCount = 0;
    if (argsNode) {
      argCount = argsNode.namedChildren.filter(
        (c: TSNode) => c.type !== "comment"
      ).length;
      if (argCount === 0 && argsNode.text !== "()") argCount = 1;
    }

    // Determine which function this call is inside
    let caller = "<module>";
    for (const func of funcs) {
      if (line > func.bodyRange.startRow + 1 && line <= func.bodyRange.endRow + 1) {
        caller = func.name;
        break;
      }
    }

    calls.push({ caller: `${file}:${caller}`, callee, file, line, argCount });
  }

  // Also extract method calls: x.Method(args)
  const methodCalls = rootNode.descendantsOfType("call_expression") ?? [];
  // method_call_expression may not exist as a separate node in tree-sitter-go;
  // the call_expression with a selector_expression as function handles this.

  return calls;
}

/**
 * Extract Go imports. Two forms:
 *   import "fmt"
 *   import (
 *     "fmt"
 *     alias "net/http"
 *   )
 *   import . "fmt"      (dot import)
 *   import _ "fmt"       (blank import)
 */
function extractImports(rootNode: TSNode, file: string): GoImportInfo[] {
  const imports: GoImportInfo[] = [];

  // Single imports: import "path"
  const singleImports = rootNode.descendantsOfType("import_declaration") ?? [];
  for (const node of singleImports) {
    // Check for import_spec children
    const specs = node.descendantsOfType("import_spec") ?? [];
    for (const spec of specs) {
      const pathNode = spec.namedChildren.find((c: TSNode) => c.type === "interpreted_string_literal");
      if (!pathNode) continue;
      const source = pathNode.text.replace(/^"/, "").replace(/"$/, "");

      // Check for alias
      const aliasNode = spec.namedChildren.find(
        (c: TSNode) => c.type === "package_identifier" || c.type === "dot"
      );
      let imported: string;
      if (aliasNode) {
        imported = aliasNode.type === "dot" ? "." : aliasNode.text;
      } else {
        // Default: last segment of path
        imported = source.split("/").pop() ?? source;
      }

      // Skip blank imports
      if (imported === "_") continue;

      imports.push({ file, imported, source });
    }

    // Handle single import without parens (import_spec_list not present)
    if (specs.length === 0) {
      // Try to find the string literal directly
      const strLit = node.descendantsOfType("interpreted_string_literal");
      for (const s of strLit) {
        const source = s.text.replace(/^"/, "").replace(/"$/, "");
        const imported = source.split("/").pop() ?? source;
        imports.push({ file, imported, source });
      }
    }
  }

  return imports;
}

/**
 * Detect HTTP handler registrations for common Go frameworks.
 *
 * Gin:   r.GET("/path", handler)
 * Echo:  e.GET("/path", handler)
 * Fiber: app.Get("/path", handler)
 * net/http: http.HandleFunc("/path", handler) / mux.Handle("/path", handler)
 */
function extractRoutes(
  rootNode: TSNode,
  file: string,
  funcs: GoFuncDef[],
): GoRoute[] {
  const routes: GoRoute[] = [];
  const callNodes = rootNode.descendantsOfType("call_expression") ?? [];

  for (const callNode of callNodes) {
    const funcNode = getChildByFieldName(callNode, "function");
    if (!funcNode) continue;

    const funcText = funcNode.text;
    const line = callNode.startPosition.row + 1;

    // Framework method calls: r.GET("/path", handler) etc.
    //   selector_expression: <receiver>.GET
    if (funcNode.type === "selector_expression") {
      const methodNameNode = funcNode.namedChildren.find(
        (c: TSNode) => c.type === "field_identifier"
      );
      const methodName = methodNameNode?.text ?? "";
      const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

      if (httpMethods.includes(methodName)) {
        const pathStr = extractFirstStringArg(callNode);
        if (pathStr) {
          routes.push({
            method: methodName,
            path: pathStr,
            handler: findHandlerFromCallArgs(callNode, funcs),
            framework: detectFramework(funcNode),
            file,
            line,
          });
        }
      }
    }

    // net/http style: http.HandleFunc("/path", handler)
    if (funcNode.type === "selector_expression") {
      const methodNameNode = funcNode.namedChildren.find(
        (c: TSNode) => c.type === "field_identifier"
      );
      const methodName = methodNameNode?.text ?? "";

      if (methodName === "HandleFunc" || methodName === "Handle") {
        const pathStr = extractFirstStringArg(callNode);
        if (pathStr) {
          routes.push({
            method: "*",  // all methods
            path: pathStr,
            handler: findHandlerFromCallArgs(callNode, funcs),
            framework: "net-http",
            file,
            line,
          });
        }
      }
    }
  }

  return routes;
}

/** Extract the first string literal argument from a call_expression */
function extractFirstStringArg(callNode: TSNode): string | null {
  const argsNode = getChildByFieldName(callNode, "arguments");
  if (!argsNode) return null;
  for (const arg of argsNode.namedChildren) {
    if (arg.type === "interpreted_string_literal") {
      return arg.text.replace(/^"/, "").replace(/"$/, "");
    }
  }
  return null;
}

/**
 * Attempt to detect the framework from the receiver variable name / import patterns.
 */
function detectFramework(selectorNode: TSNode): string {
  const operandNode = selectorNode.namedChildren.find(
    (c: TSNode) => c.type === "identifier" || c.type === "package_identifier"
  );
  const pkg = operandNode?.text.toLowerCase() ?? "";

  if (pkg === "gin" || pkg === "r" || pkg === "router") return "gin";
  if (pkg === "echo" || pkg === "e") return "echo";
  if (pkg === "app" || pkg === "fiber") return "fiber";
  if (pkg === "http" || pkg === "mux") return "net-http";
  return "unknown";
}

/**
 * Try to find the handler function name from the second argument of a call.
 * It may be an identifier or a selector_expression like package.HandlerFunc.
 */
function findHandlerFromCallArgs(callNode: TSNode, funcs: GoFuncDef[]): string {
  const argsNode = getChildByFieldName(callNode, "arguments");
  if (!argsNode) return "<unknown>";

  let argIndex = 0;
  for (const arg of argsNode.namedChildren) {
    if (arg.type === "interpreted_string_literal") continue; // skip path string
    if (arg.type === "comment") continue;

    if (arg.type === "identifier") {
      return arg.text;
    }
    if (arg.type === "selector_expression") {
      return arg.text; // e.g. "myHandler.HandleUser"
    }
    // If it's a func literal (anonymous function)
    if (arg.type === "func_literal") {
      return `<anonymous:${callNode.startPosition.row + 1}>`;
    }
    argIndex++;
  }
  return "<unknown>";
}

// ─── Import resolution (for local Go packages) ──────────────────

function buildFileIndex(files: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    const noExt = file.replace(/\.go$/, "");
    index.set(noExt, file);
    const base = path.basename(file, ".go");
    index.set(base, file);
    // Index by directory path (Go package name = directory)
    const dir = path.dirname(file).replaceAll("\\", "/");
    if (!index.has(dir)) {
      index.set(dir, file);
    }
  }
  return index;
}

/**
 * Go local imports use module-relative paths. For local (relative) imports
 * we can try to map them; external imports (like "net/http") remain unresolved.
 */
function resolveGoImport(
  source: string,
  currentFile: string,
  fileIndex: Map<string, string>,
): string | undefined {
  // Skip standard library and external module imports
  if (!source.includes("/") || source.startsWith("github.com") ||
      source.startsWith("gitlab.com") || source.startsWith("bitbucket.org") ||
      source.startsWith("golang.org") || source.startsWith("gopkg.in")) {
    return undefined;
  }

  // For local module imports, try matching as a directory
  if (fileIndex.has(source)) return fileIndex.get(source);

  return undefined;
}

// ─── Graceful fallback ──────────────────────────────────────────

function emptyGoCallGraph(): GoCallGraph {
  return {
    functions: new Map(),
    calls: [],
    imports: [],
    routes: [],
    fileIndex: new Map(),
  };
}

// ─── Public API ─────────────────────────────────────────────────

export async function buildGoCallGraph(root: string): Promise<GoCallGraph> {
  // Graceful degradation: return empty graph if WASM grammar is not available
  let parserReady = false;
  try {
    await getParser();
    await getGoLanguage();
    parserReady = true;
  } catch {
    return emptyGoCallGraph();
  }
  if (!parserReady) return emptyGoCallGraph();

  const files = await walkGoFiles(root);
  if (files.length === 0) return emptyGoCallGraph();

  const fileIndex = buildFileIndex(files);
  const functions = new Map<string, GoFuncDef>();
  const allCalls: GoCallSite[] = [];
  const allImports: GoImportInfo[] = [];
  const allRoutes: GoRoute[] = [];

  const p = await getParser();

  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(path.join(root, file), "utf8");
    } catch {
      continue;
    }

    let tree: any;
    try {
      tree = p.parse(text);
    } catch {
      continue;
    }

    const rootNode = tree.rootNode as unknown as TSNode;

    // Extract functions and methods
    const funcs = extractFunctions(rootNode, file);
    for (const func of funcs) {
      const qualified = func.isMethod && func.receiver
        ? `${file}:(${func.receiver}).${func.name}`
        : `${file}:${func.name}`;
      functions.set(qualified, func);
    }

    // Extract calls
    const calls = extractCalls(rootNode, file, funcs);
    allCalls.push(...calls);

    // Extract imports
    const imports = extractImports(rootNode, file);
    for (const imp of imports) {
      imp.resolved = resolveGoImport(imp.source, file, fileIndex);
      allImports.push(imp);
    }

    // Extract routes (HTTP handler registrations)
    const routes = extractRoutes(rootNode, file, funcs);
    allRoutes.push(...routes);
  }

  return { functions, calls: allCalls, imports: allImports, routes: allRoutes, fileIndex };
}
