import { promises as fs } from "node:fs";
import path from "node:path";

// ─── Types ──────────────────────────────────────────────────────

export interface RustFuncDef {
  name: string;
  file: string;
  line: number;
  params: string[];
  implType?: string;       // impl block type, e.g. "Server" or "MyStruct<T>"
  isMethod: boolean;
  isPublic: boolean;
  isAsync: boolean;
  bodyRange: { startRow: number; endRow: number };
}

export interface RustCallSite {
  caller: string;      // "file.rs:funcName"
  callee: string;      // e.g. "tokio::spawn" or "self.handle_request"
  file: string;
  line: number;
  argCount: number;
}

export interface RustImportInfo {
  file: string;
  imported: string;     // final item name or alias
  source: string;       // full use path: "std::collections::HashMap"
  resolved?: string;
}

export interface RustRoute {
  method: string;       // GET, POST, PUT, DELETE, PATCH
  path: string;         // e.g. "/api/users"
  handler: string;      // function name
  framework: string;    // "actix", "axum", "rocket"
  file: string;
  line: number;
  attributes: string[]; // route attributes/macros
}

export interface RustCallGraph {
  functions: Map<string, RustFuncDef>;
  calls: RustCallSite[];
  imports: RustImportInfo[];
  routes: RustRoute[];
  fileIndex: Map<string, string>;
}

// ─── Tree-sitter singleton (WASM-based) ────────────────────────

let parser: any = null;
let ParserLib: any = null;
let rustLang: any = null;

const WASM_DIR = "node_modules/tree-sitter-wasms/out";

async function getParser(): Promise<any> {
  if (parser) return parser;
  const mod = await import("web-tree-sitter");
  ParserLib = mod.Parser ? mod : mod.default ?? mod;
  await ParserLib.Parser.init();
  parser = new ParserLib.Parser();
  return parser;
}

async function getRustLanguage(): Promise<any> {
  if (rustLang) return rustLang;
  const p = await getParser();
  const wasmPath = path.join(WASM_DIR, "tree-sitter-rust.wasm");
  rustLang = await ParserLib.Language.load(wasmPath);
  p.setLanguage(rustLang);
  return rustLang;
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

async function walkRustFiles(root: string, dir = root): Promise<string[]> {
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
      result.push(...(await walkRustFiles(root, fullPath)));
    } else if (entry.name.endsWith(".rs")) {
      result.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }
  return result;
}

// ─── AST extraction ─────────────────────────────────────────────

/**
 * Extract fn declarations. Rust tree-sitter node types:
 *   function_item    → pub async fn foo(...) -> RetType { ... }
 *   function_signature_item → fn foo(...); (in extern blocks)
 *
 * Methods inside `impl` blocks are also `function_item` nodes,
 * but their parent is `declaration_list` inside an `impl_item`.
 */
function extractFunctions(rootNode: TSNode, file: string): RustFuncDef[] {
  const funcs: RustFuncDef[] = [];
  const funcItems = rootNode.descendantsOfType("function_item") ?? [];

  for (const node of funcItems) {
    const nameNode = getChildByFieldName(node, "name");
    if (!nameNode) continue;

    const paramsNode = getChildByFieldName(node, "parameters");
    const params = extractParamNames(paramsNode);

    // Check modifiers from ancestor/attributes
    const nodeText = node.text;
    const isPublic = /\bpub\b/.test(nodeText.split("{")[0] ?? "");
    const isAsync = /\basync\b/.test(nodeText.split("{")[0] ?? "");

    // Determine if this is inside an impl block
    let implType: string | undefined;
    let isMethod = false;
    let ancestor = node.parent;
    while (ancestor) {
      if (ancestor.type === "impl_item") {
        const typeNode = getChildByFieldName(ancestor, "type");
        if (typeNode) {
          implType = typeNode.text;
          isMethod = true;
        }
        break;
      }
      ancestor = ancestor.parent;
    }

    funcs.push({
      name: nameNode.text,
      file,
      line: node.startPosition.row + 1,
      params,
      implType,
      isMethod,
      isPublic,
      isAsync,
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
    if (param.type === "parameter" || param.type === "self_parameter") {
      // self, &self, &mut self
      if (param.type === "self_parameter") {
        params.push("self");
        continue;
      }
      // parameter has a pattern child with the name
      const patternNode = getChildByFieldName(param, "pattern");
      if (patternNode) {
        if (patternNode.type === "identifier") {
          params.push(patternNode.text);
        } else if (patternNode.type === "mut_pattern") {
          // mut x
          const inner = patternNode.namedChildren.find((c: TSNode) => c.type === "identifier");
          if (inner) params.push(inner.text);
        }
      } else {
        // Try to find identifier directly in named children
        const identNode = param.namedChildren.find((c: TSNode) => c.type === "identifier");
        if (identNode) params.push(identNode.text);
      }
    } else if (param.type === "variadic_parameter") {
      params.push("...");
    }
  }
  return params;
}

/**
 * Extract call expressions. Rust tree-sitter types:
 *   call_expression    → foo(args)
 *   method_call_expression → obj.method(args)
 */
function extractCalls(rootNode: TSNode, file: string, funcs: RustFuncDef[]): RustCallSite[] {
  const calls: RustCallSite[] = [];

  // Regular function calls: foo(args) or path::to::foo(args)
  const callExprs = rootNode.descendantsOfType("call_expression") ?? [];
  for (const callNode of callExprs) {
    const funcNode = getChildByFieldName(callNode, "function");
    if (!funcNode) continue;

    const callee = funcNode.text;
    const line = callNode.startPosition.row + 1;

    // Skip common Rust macros and builtins that are not real user calls
    if (/^(println|print|eprintln|eprint|format|vec|assert|assert_eq|assert_ne|debug_assert|todo|unimplemented|unreachable|cfg|include|include_str|include_bytes|env|option_env|concat|stringify|module_path|file|line|column)$/.test(callee)) {
      continue;
    }

    const argCount = countArgsFromNode(callNode);

    // Determine enclosing function
    let caller = "<module>";
    for (const func of funcs) {
      if (line > func.bodyRange.startRow + 1 && line <= func.bodyRange.endRow + 1) {
        caller = func.name;
        break;
      }
    }

    calls.push({ caller: `${file}:${caller}`, callee, file, line, argCount });
  }

  // Method calls: obj.method(args)
  const methodCallExprs = rootNode.descendantsOfType("method_call_expression") ?? [];
  for (const callNode of methodCallExprs) {
    const nameNode = getChildByFieldName(callNode, "name");
    if (!nameNode) continue;

    const receiverNode = getChildByFieldName(callNode, "receiver");
    const receiverText = receiverNode?.text ?? "";
    const callee = receiverText ? `${receiverText}.${nameNode.text}` : nameNode.text;
    const line = callNode.startPosition.row + 1;
    const argCount = countArgsFromNode(callNode);

    // Determine enclosing function
    let caller = "<module>";
    for (const func of funcs) {
      if (line > func.bodyRange.startRow + 1 && line <= func.bodyRange.endRow + 1) {
        caller = func.name;
        break;
      }
    }

    calls.push({ caller: `${file}:${caller}`, callee, file, line, argCount });
  }

  return calls;
}

function countArgsFromNode(callNode: TSNode): number {
  const argsNode = getChildByFieldName(callNode, "arguments");
  if (!argsNode) return 0;
  let count = argsNode.namedChildren.filter((c: TSNode) => c.type !== "comment").length;
  if (count === 0 && argsNode.text !== "()") count = 1;
  return count;
}

/**
 * Extract use declarations. Rust patterns:
 *   use std::collections::HashMap;
 *   use tokio::sync::{Mutex, RwLock};
 *   use crate::models::{self, User};
 *   use super::config::Config;
 */
function extractImports(rootNode: TSNode, file: string): RustImportInfo[] {
  const imports: RustImportInfo[] = [];
  const useDecls = rootNode.descendantsOfType("use_declaration") ?? [];

  for (const useDecl of useDecls) {
    // The use_declaration contains a use_wildcard or use_list or use_as_clause etc.
    const scopeNode = useDecl.namedChildren[0]; // first named child is the scoped identifier
    if (!scopeNode) continue;

    collectUsePaths(scopeNode, file, "", imports);
  }

  return imports;
}

/**
 * Recursively walk use tree to collect all imported names.
 */
function collectUsePaths(
  node: TSNode,
  file: string,
  prefix: string,
  out: RustImportInfo[],
): void {
  if (node.type === "scoped_identifier") {
    // e.g. std::collections — compose the full path
    const parts: string[] = [];
    for (const child of node.namedChildren) {
      if (child.type === "identifier") {
        parts.push(child.text);
      }
    }
    const fullPath = parts.join("::");
    out.push({
      file,
      imported: parts[parts.length - 1] ?? fullPath,
      source: fullPath,
    });
  } else if (node.type === "identifier") {
    // Simple single name: use foo;
    const fullPath = prefix ? `${prefix}::${node.text}` : node.text;
    out.push({
      file,
      imported: node.text,
      source: fullPath,
    });
  } else if (node.type === "use_list") {
    // use std::{collections, io};
    for (const child of node.namedChildren) {
      collectUsePaths(child, file, prefix, out);
    }
  } else if (node.type === "use_wildcard") {
    // use std::collections::*;
    out.push({
      file,
      imported: "*",
      source: prefix || "*",
    });
  } else if (node.type === "use_as_clause") {
    // use foo as bar
    const children = node.namedChildren;
    const pathNode = children.find((c: TSNode) => c.type === "scoped_identifier" || c.type === "identifier");
    const aliasNode = children.find((c: TSNode) => c.type === "identifier" && c !== pathNode);
    if (pathNode && aliasNode) {
      const pathStr = pathNode.type === "identifier"
        ? pathNode.text
        : pathNode.text;
      out.push({
        file,
        imported: aliasNode.text,
        source: prefix ? `${prefix}::${pathStr}` : pathStr,
      });
    }
  } else if (node.type === "scoped_use_list") {
    // use tokio::sync::{Mutex, RwLock};
    const scopeNode = node.namedChildren.find(
      (c: TSNode) => c.type === "scoped_identifier" || c.type === "identifier"
    );
    const listNode = node.namedChildren.find((c: TSNode) => c.type === "use_list");
    const newPrefix = scopeNode ? (prefix ? `${prefix}::${scopeNode.text}` : scopeNode.text) : prefix;
    if (listNode) {
      collectUsePaths(listNode, file, newPrefix, out);
    }
  }
}

/**
 * Detect route registrations for Rust frameworks.
 *
 * Actix-web:
 *   #[get("/path")]  #[post("/path")]  #[route("/path", method = "GET")]
 *   .route("/path", web::get().to(handler))
 *
 * Axum:
 *   Router::new().route("/path", get(handler))
 *   .route("/path", post(handler))
 *
 * Rocket:
 *   #[get("/path")]  #[post("/path")]  #[put("/path")]
 *   #[route(GET, path = "/path")]
 */
function extractRoutes(
  rootNode: TSNode,
  file: string,
  funcs: RustFuncDef[],
): RustRoute[] {
  const routes: RustRoute[] = [];

  // 1. Scan for attribute macros on functions: #[get("/path")] etc.
  for (const func of funcs) {
    // Look at the function_item node at the func's line for attributes
    const funcNodes = rootNode.descendantsOfType("function_item") ?? [];
    for (const node of funcNodes) {
      if (node.startPosition.row + 1 !== func.line) continue;

      // Check for outer attributes (attribute_item nodes preceding this fn)
      // In tree-sitter-rust, attributes may be children of the parent decorated_definition
      // or siblings. Let's check for attribute_item in the parent's children.
      const parent = node.parent;
      if (!parent) continue;

      const attrs: string[] = [];
      for (const sibling of parent.namedChildren) {
        if (sibling.type === "attribute_item" &&
            sibling.startPosition.row < node.startPosition.row) {
          attrs.push(sibling.text);
        }
        // Also check if attribute_item is directly a child of the function_item
        // (some grammars nest attributes differently)
      }

      // Also check attribute_item children within function_item
      const directAttrs = node.descendantsOfType("attribute_item") ?? [];
      for (const attr of directAttrs) {
        attrs.push(attr.text);
      }

      // Scan attributes for route patterns
      for (const attr of attrs) {
        // Actix/Rocket: #[get("/path")]
        const httpMethodMatch = attr.match(
          /#\[(get|post|put|delete|patch|head|options)\s*\(\s*"([^"]+)"/i
        );
        if (httpMethodMatch) {
          routes.push({
            method: httpMethodMatch[1].toUpperCase(),
            path: httpMethodMatch[2],
            handler: func.name,
            framework: detectRustFramework(attrs, file),
            file,
            line: func.line,
            attributes: attrs,
          });
          continue;
        }

        // Rocket: #[route(GET, path = "/path")]
        const rocketRouteMatch = attr.match(
          /#\[route\s*\(\s*(\w+)\s*,\s*path\s*=\s*"([^"]+)"/i
        );
        if (rocketRouteMatch) {
          routes.push({
            method: rocketRouteMatch[1].toUpperCase(),
            path: rocketRouteMatch[2],
            handler: func.name,
            framework: "rocket",
            file,
            line: func.line,
            attributes: attrs,
          });
        }
      }
      break; // only one function_item per line
    }
  }

  // 2. Scan for method-call patterns: .route("/path", get(handler))
  const methodCalls = rootNode.descendantsOfType("call_expression") ?? [];
  for (const callNode of methodCalls) {
    const funcNode = getChildByFieldName(callNode, "function");
    if (!funcNode) continue;

    const funcText = funcNode.text;

    // Axum style: .route("/path", get(handler))
    // This appears as: call_expression where function is "route" and
    // the arguments contain a call like get(handler)
    if (funcText === "route" || funcText.endsWith(".route")) {
      const argsNode = getChildByFieldName(callNode, "arguments");
      if (!argsNode) continue;

      // Find the first string argument (path)
      let routePath: string | null = null;
      for (const arg of argsNode.namedChildren) {
        if (arg.type === "string_literal") {
          routePath = arg.text.replace(/^"/, "").replace(/"$/, "");
          break;
        }
      }

      // Find the second argument — a call like get(handler)
      for (const arg of argsNode.namedChildren) {
        if (arg.type === "call_expression") {
          const innerFunc = getChildByFieldName(arg, "function");
          if (!innerFunc) continue;
          const innerName = innerFunc.text.toLowerCase();
          const httpMethods = ["get", "post", "put", "delete", "patch", "head", "options"];
          if (httpMethods.includes(innerName)) {
            const handlerName = extractHandlerFromArgs(arg);
            routes.push({
              method: innerName.toUpperCase(),
              path: routePath ?? "<dynamic>",
              handler: handlerName,
              framework: "axum",
              file,
              line: callNode.startPosition.row + 1,
              attributes: [],
            });
          }
        }
      }
    }

    // Actix-web style: .route("/path", web::get().to(handler))
    if (funcText.endsWith(".to")) {
      // Check if this is inside a larger chain that includes .route()
      const handlerName = extractHandlerFromArgs(callNode);
      if (handlerName !== "<unknown>") {
        // Walk up to find the .route() call for the path
        const routePath = findActixRoutePath(callNode);
        const method = detectActixMethod(callNode);
        routes.push({
          method: method,
          path: routePath ?? "<dynamic>",
          handler: handlerName,
          framework: "actix",
          file,
          line: callNode.startPosition.row + 1,
          attributes: [],
        });
      }
    }
  }

  return routes;
}

function extractHandlerFromArgs(callNode: TSNode): string {
  const argsNode = getChildByFieldName(callNode, "arguments");
  if (!argsNode) return "<unknown>";

  for (const arg of argsNode.namedChildren) {
    if (arg.type === "identifier") return arg.text;
    if (arg.type === "scoped_identifier") return arg.text;
    // closures: |req| ... → skip
    if (arg.type === "closure_expression") {
      return `<closure:${callNode.startPosition.row + 1}>`;
    }
  }
  return "<unknown>";
}

function findActixRoutePath(node: TSNode): string | null {
  // Walk up through parent call expressions to find .route()
  let current: TSNode | null = node.parent;
  while (current) {
    if (current.type === "call_expression") {
      const func = getChildByFieldName(current, "function");
      if (func && func.text.endsWith(".route")) {
        const args = getChildByFieldName(current, "arguments");
        if (args) {
          for (const arg of args.namedChildren) {
            if (arg.type === "string_literal") {
              return arg.text.replace(/^"/, "").replace(/"$/, "");
            }
          }
        }
      }
    }
    current = current.parent;
  }
  return null;
}

function detectActixMethod(node: TSNode): string {
  // Walk up to find web::get(), web::post(), etc.
  let current: TSNode | null = node.parent;
  while (current) {
    if (current.type === "call_expression") {
      const func = getChildByFieldName(current, "function");
      if (func) {
        const text = func.text;
        const match = text.match(/web::(get|post|put|delete|patch|head|options)/i);
        if (match) return match[1].toUpperCase();
      }
    }
    current = current.parent;
  }
  return "*";
}

function detectRustFramework(attrs: string[], file: string): string {
  // Check attribute style for hints
  for (const attr of attrs) {
    // Rocket uses: #[get("/path")] without the actix import pattern
    // Hard to distinguish by attribute alone, so check file content patterns
  }

  // Use file path or known conventions
  if (file.includes("actix")) return "actix";
  if (file.includes("rocket")) return "rocket";
  if (file.includes("axum")) return "axum";

  // Default: both Rocket and Actix use #[get("/path")] — default to actix as most common
  return "actix";
}

// ─── Import resolution ──────────────────────────────────────────

function buildFileIndex(files: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    const noExt = file.replace(/\.rs$/, "");
    index.set(noExt, file);
    const base = path.basename(file, ".rs");
    index.set(base, file);
    // Index by directory path
    const dir = path.dirname(file).replaceAll("\\", "/");
    if (!index.has(dir)) {
      index.set(dir, file);
    }
  }
  return index;
}

/**
 * Resolve crate-local imports (crate::, super::, self::).
 * External crate imports cannot be resolved to local files.
 */
function resolveRustImport(
  source: string,
  currentFile: string,
  fileIndex: Map<string, string>,
): string | undefined {
  // crate:: path — try matching to src/ files
  if (source.startsWith("crate::")) {
    const relPath = source.replace("crate::", "").replace("::", "/");
    // Try in src/ directory
    const candidates = [`src/${relPath}`, relPath];
    for (const candidate of candidates) {
      if (fileIndex.has(candidate)) return fileIndex.get(candidate);
    }
  }

  // super:: path — go one directory up from current file
  if (source.startsWith("super::")) {
    const currentDir = path.dirname(currentFile);
    const parentDir = path.dirname(currentDir).replaceAll("\\", "/");
    const relPath = source.replace("super::", "").replace(/::/g, "/");
    const candidate = parentDir === "." ? relPath : `${parentDir}/${relPath}`;
    if (fileIndex.has(candidate)) return fileIndex.get(candidate);
  }

  // self:: path — relative to current file's directory
  if (source.startsWith("self::")) {
    const currentDir = path.dirname(currentFile).replaceAll("\\", "/");
    const relPath = source.replace("self::", "").replace(/::/g, "/");
    const candidate = currentDir === "." ? relPath : `${currentDir}/${relPath}`;
    if (fileIndex.has(candidate)) return fileIndex.get(candidate);
  }

  return undefined;
}

// ─── Graceful fallback ──────────────────────────────────────────

function emptyRustCallGraph(): RustCallGraph {
  return {
    functions: new Map(),
    calls: [],
    imports: [],
    routes: [],
    fileIndex: new Map(),
  };
}

// ─── Public API ─────────────────────────────────────────────────

export async function buildRustCallGraph(root: string): Promise<RustCallGraph> {
  // Graceful degradation: return empty graph if WASM grammar is not available
  let parserReady = false;
  try {
    await getParser();
    await getRustLanguage();
    parserReady = true;
  } catch {
    return emptyRustCallGraph();
  }
  if (!parserReady) return emptyRustCallGraph();

  const files = await walkRustFiles(root);
  if (files.length === 0) return emptyRustCallGraph();

  const fileIndex = buildFileIndex(files);
  const functions = new Map<string, RustFuncDef>();
  const allCalls: RustCallSite[] = [];
  const allImports: RustImportInfo[] = [];
  const allRoutes: RustRoute[] = [];

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

    // Extract functions (including impl methods)
    const funcs = extractFunctions(rootNode, file);
    for (const func of funcs) {
      const qualified = func.isMethod && func.implType
        ? `${file}:(${func.implType}).${func.name}`
        : `${file}:${func.name}`;
      functions.set(qualified, func);
    }

    // Extract calls (function + method calls)
    const calls = extractCalls(rootNode, file, funcs);
    allCalls.push(...calls);

    // Extract imports
    const imports = extractImports(rootNode, file);
    for (const imp of imports) {
      imp.resolved = resolveRustImport(imp.source, file, fileIndex);
      allImports.push(imp);
    }

    // Extract routes (framework handler registrations)
    const routes = extractRoutes(rootNode, file, funcs);
    allRoutes.push(...routes);
  }

  return { functions, calls: allCalls, imports: allImports, routes: allRoutes, fileIndex };
}
