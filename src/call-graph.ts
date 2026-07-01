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
  weak?: boolean;       // true for dynamic imports / uncertain edges
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

// ─── Tree-sitter singleton ──────────────────────────────────────

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

function isJsTsExt(ext: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".vue"].includes(ext);
}

function isPythonExt(ext: string): boolean {
  return ext === ".py";
}

function isGoExt(ext: string): boolean {
  return ext === ".go";
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

const JS_TS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

// ─── File scanning ──────────────────────────────────────────────

async function walkSourceFiles(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  const skip = new Set([
    "node_modules", ".next", "dist", "build", "target", "__pycache__", ".venv", "venv", "vendor", "third_party",
    "fixtures", "testdata", "test_data", "samples", "e2e", "cypress", "playwright",
    "test", "tests", "__tests__", "spec", "specs", "example", "examples", "demo", "demos",
    "bench", "benchmark", "benchmarks", "docs", "doc", ".git",
    ".worktrees", ".demokiller", ".claude", ".vscode",
  ]);
  const SKIP_FILE_RE = /[._](?:test|spec|e2e)\.[^.]+$/i;

  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkSourceFiles(root, fullPath)));
    } else {
      const rel = path.relative(root, fullPath).replaceAll("\\", "/");
      if (SKIP_FILE_RE.test(entry.name)) continue;
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
  // Track basenames to detect conflicts — don't overwrite if ambiguous
  const basenameCount = new Map<string, number>();

  for (const file of files) {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    basenameCount.set(base, (basenameCount.get(base) ?? 0) + 1);
  }

  for (const file of files) {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const noExt = file.replace(/\.[^.]+$/, "");

    // Always index by full path without extension
    index.set(noExt, file);

    // Only index by basename if unique (no conflict)
    if ((basenameCount.get(base) ?? 0) === 1) {
      index.set(base, file);
    }

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

// ─── Regex-based extraction (original, fallback) ────────────────

function extractFunctionsRegex(text: string, file: string): FuncDef[] {
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

function extractImportsRegex(text: string, file: string): ImportInfo[] {
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

function extractCallsRegex(text: string, file: string): CallSite[] {
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

// ─── AST-based extraction (tree-sitter) ─────────────────────────

const CALL_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "instanceof",
  "new", "await", "async", "import", "export", "from", "const", "let", "var",
  "function", "class", "extends", "implements", "interface", "type", "enum",
  "delete", "void", "throw", "yield",
]);

// Find which function a given row belongs to (for AST-based caller resolution)
function findEnclosingFunction(
  row: number,
  funcs: FuncDef[],
): string {
  let best: FuncDef | undefined;
  for (const func of funcs) {
    // func.line is 1-based, row is 0-based
    if (func.line - 1 <= row) {
      if (!best || func.line > best.line) {
        best = func;
      }
    }
  }
  return best ? best.name : "<module>";
}

// Build a map of class body ranges for JS/TS: className → { startRow, endRow, methods: Map<string, number> }
interface ClassInfo {
  name: string;
  startRow: number;
  endRow: number;
  methods: Map<string, number>; // methodName → definition row
}

function extractClassInfos(rootNode: TSNode, file: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  // JS/TS class_declaration, Python class_definition, Go struct (handled differently)
  const classTypes = ["class_declaration", "class_definition", "class"];
  for (const ctype of classTypes) {
    for (const cls of rootNode.descendantsOfType(ctype) ?? []) {
      const nameNode = getChildByFieldName(cls, "name");
      if (!nameNode) continue;

      const methods = new Map<string, number>();
      // JS/TS: method_definition; Python: function_definition inside class
      const methodDefs = cls.descendantsOfType("method_definition") ?? [];
      for (const md of methodDefs) {
        const mn = getChildByFieldName(md, "name");
        if (mn) methods.set(mn.text, md.startPosition.row);
      }
      // Python methods are just function_definition inside class body
      const pyFuncDefs = cls.descendantsOfType("function_definition") ?? [];
      for (const fd of pyFuncDefs) {
        const fn = getChildByFieldName(fd, "name");
        if (fn && !methods.has(fn.text)) {
          methods.set(fn.text, fd.startPosition.row);
        }
      }

      classes.push({
        name: nameNode.text,
        startRow: cls.startPosition.row,
        endRow: cls.endPosition.row,
        methods,
      });
    }
  }
  return classes;
}

// Extract function definitions via AST
function extractFunctionsAST(rootNode: TSNode, file: string, ext: string): FuncDef[] {
  const funcs: FuncDef[] = [];
  const seen = new Set<string>();

  // Determine which node types represent function definitions for this language
  const funcTypes = isJsTsExt(ext)
    ? ["function_declaration", "function_definition", "method_definition"]
    : isPythonExt(ext)
    ? ["function_definition"]
    : isGoExt(ext)
    ? ["function_declaration", "method_declaration"]
    : ["function_declaration", "function_definition", "method_definition",
       "method_declaration", "function_item"]; // Rust fn, Java/C# methods

  for (const ftype of funcTypes) {
    for (const node of rootNode.descendantsOfType(ftype) ?? []) {
      const nameNode = getChildByFieldName(node, "name");
      if (!nameNode) continue;

      const name = nameNode.text;
      // For methods, include class name prefix to avoid ambiguity
      let qualifiedName = name;
      if (node.type === "method_definition" || node.type === "method_declaration") {
        const parent = node.parent;
        if (parent?.type === "class_body" || parent?.type === "class_declaration") {
          const className = getChildByFieldName(parent.parent!, "name");
          if (className) {
            qualifiedName = `${className.text}.${name}`;
          }
        }
      }

      if (seen.has(qualifiedName)) continue;
      seen.add(qualifiedName);

      // Extract params
      const params: string[] = [];
      const paramsNode = getChildByFieldName(node, "parameters")
        ?? getChildByFieldName(node, "formal_parameters")
        ?? getChildByFieldName(node, "parameter_list");
      if (paramsNode) {
        for (const child of paramsNode.namedChildren) {
          if (child.type === "identifier" || child.type === "simple_parameter") {
            const ident = child.type === "identifier" ? child : getChildByFieldName(child, "name");
            if (ident) params.push(ident.text);
          } else if (child.type === "required_parameter" || child.type === "optional_parameter") {
            const ident = getChildByFieldName(child, "name")
              ?? getChildByFieldName(child, "pattern");
            if (ident) params.push(ident.text);
          } else if (child.type === "typed_parameter" || child.type === "default_parameter") {
            for (const sub of child.namedChildren) {
              if (sub.type === "identifier") { params.push(sub.text); break; }
            }
          } else if (child.type === "parameter" && child.namedChildren.length > 0) {
            // Go parameter
            for (const sub of child.namedChildren) {
              if (sub.type === "identifier") { params.push(sub.text); break; }
            }
          }
        }
      }

      funcs.push({
        name: qualifiedName,
        file,
        line: node.startPosition.row + 1,
        params,
        bodyRange: { start: node.startPosition.row, end: node.endPosition.row },
      });
    }
  }

  return funcs;
}

// Extract calls via AST
function extractCallsAST(
  rootNode: TSNode,
  file: string,
  funcs: FuncDef[],
  classInfos: ClassInfo[],
  ext: string,
): CallSite[] {
  const calls: CallSite[] = [];

  // 1. Standard call_expression / call nodes
  const callTypes = isPythonExt(ext) ? ["call"] : ["call_expression"];
  for (const callType of callTypes) {
    for (const callNode of rootNode.descendantsOfType(callType) ?? []) {
      const funcNode = getChildByFieldName(callNode, "function");
      if (!funcNode) continue;

      let callee: string;
      let isDynamicImport = false;

      if (funcNode.type === "identifier") {
        callee = funcNode.text;
      } else if (funcNode.type === "member_expression" || funcNode.type === "attribute") {
        // obj.method or obj.method()
        const objNode = getChildByFieldName(funcNode, "object");
        const propNode = getChildByFieldName(funcNode, "property")
          ?? getChildByFieldName(funcNode, "attribute");
        if (objNode && propNode) {
          callee = `${objNode.text}.${propNode.text}`;

          // Class method tracking: this.method() → resolve to class method
          if (objNode.type === "this") {
            // Find the enclosing class and resolve this.method
            const row = callNode.startPosition.row;
            for (const cls of classInfos) {
              if (row >= cls.startRow && row <= cls.endRow) {
                const methodRow = cls.methods.get(propNode.text);
                if (methodRow !== undefined) {
                  callee = `${cls.name}.${propNode.text}`;
                }
                break;
              }
            }
          }
        } else {
          callee = funcNode.text;
        }
      } else if (funcNode.type === "super") {
        callee = "super";
      } else if (funcNode.type === "parenthesized_expression") {
        // (someFunc)() — extract inner identifier
        const inner = funcNode.namedChildren.find((c: TSNode) =>
          c.type === "identifier" || c.type === "member_expression"
        );
        callee = inner?.text ?? funcNode.text;
      } else {
        callee = funcNode.text;
      }

      // Skip keywords
      if (CALL_KEYWORDS.has(callee)) continue;
      // Skip if it looks like a type annotation or keyword usage
      if (/^(if|for|while|switch|catch|return|typeof|instanceof|new|await|async|import|export|from|const|let|var|function|class|extends|implements|interface|type|enum)$/.test(callee)) continue;

      const line = callNode.startPosition.row + 1;

      // Detect dynamic import: `import(expression)` or `await import(path)`
      if (callee === "import" && isJsTsExt(ext)) {
        isDynamicImport = true;
        callee = "dynamic:import";
      }

      // Count arguments
      const argCount = countArgsFromAST(callNode, ext);

      // Determine enclosing function
      const callerName = findEnclosingFunction(callNode.startPosition.row, funcs);

      calls.push({
        caller: `${file}:${callerName}`,
        callee,
        file,
        line,
        argCount,
        weak: isDynamicImport || undefined,
      });
    }
  }

  // 2. Callback/lambda tracking: find calls inside arrow functions and function expressions
  //    passed as arguments. These are already captured by the call_expression scan above
  //    since tree-sitter finds them at any nesting depth. No extra logic needed —
  //    the enclosing function resolution handles it.

  // 3. `new` expressions: new Foo() is also a call
  if (isJsTsExt(ext)) {
    for (const newExpr of rootNode.descendantsOfType("new_expression") ?? []) {
      const constructorNode = getChildByFieldName(newExpr, "constructor");
      if (!constructorNode) continue;
      const callee = constructorNode.text;
      if (CALL_KEYWORDS.has(callee)) continue;

      const line = newExpr.startPosition.row + 1;
      const callerName = findEnclosingFunction(newExpr.startPosition.row, funcs);

      calls.push({
        caller: `${file}:${callerName}`,
        callee,
        file,
        line,
        argCount: 0, // new expression arg counting is less critical
      });
    }
  }

  return calls;
}

function countArgsFromAST(callNode: TSNode, ext: string): number {
  // For JS/TS: arguments node; for Python: arguments node; for Go: argument_list
  const argsNode = getChildByFieldName(callNode, "arguments")
    ?? getChildByFieldName(callNode, "args");
  if (!argsNode) return 0;

  if (isPythonExt(ext)) {
    // Python: count named_children excluding comment
    const count = argsNode.namedChildren.filter((c: TSNode) => c.type !== "comment").length;
    return count === 0 && argsNode.text !== "()" ? 1 : count;
  }

  // JS/TS/Go: count children that are arguments (commas are anonymous children)
  let count = 0;
  for (const child of argsNode.namedChildren) {
    if (child.type !== "comment") count++;
  }
  // If the arguments node is empty "()", count = 0
  if (count === 0 && argsNode.text.replace(/\s/g, "") !== "()") {
    // Single unnamed expression?
    if (argsNode.namedChildren.length === 0 && argsNode.childCount > 2) count = 1;
  }
  return count;
}

// Extract imports via AST
function extractImportsAST(rootNode: TSNode, file: string, ext: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  if (isJsTsExt(ext)) {
    // import { a, b } from './mod'
    // import foo from './mod'
    // import * as foo from './mod'
    for (const stmt of rootNode.descendantsOfType("import_statement") ?? []) {
      const sourceNode = getChildByFieldName(stmt, "source");
      const source = sourceNode?.text?.replace(/^['"]|['"]$/g, "") ?? "";
      if (!source) continue;

      // Named imports: import { a, b } from '...'
      for (const id of stmt.descendantsOfType("identifier") ?? []) {
        // Exclude identifiers that are the source string
        if (id.parent?.type === "string" || id.parent?.type === "string_fragment") continue;
        // Only top-level import specifiers
        if (id.parent?.type === "import_specifier") {
          // Use the aliased name if present
          const alias = getChildByFieldName(id.parent, "alias");
          imports.push({
            file,
            imported: alias ? alias.text : id.text,
            source,
          });
        } else if (id.parent?.type === "import_clause") {
          imports.push({ file, imported: id.text, source });
        }
      }

      // Namespace import: import * as foo from '...'
      const nsId = stmt.descendantsOfType("namespace_import") ?? [];
      for (const ns of nsId) {
        const id = ns.namedChildren.find((c: TSNode) => c.type === "identifier");
        if (id) imports.push({ file, imported: id.text, source });
      }

      // If no identifiers found but there's a source, it's a side-effect import
      // (import './polyfill') — no names to track
    }

    // Dynamic imports: const mod = await import('./mod')
    for (const dynImport of rootNode.descendantsOfType("import") ?? []) {
      // tree-sitter may parse dynamic import() as a call expression
      // Already handled in extractCallsAST — mark as weak edge
    }

    // require() calls
    for (const call of rootNode.descendantsOfType("call_expression") ?? []) {
      const funcNode = getChildByFieldName(call, "function");
      if (!funcNode || funcNode.text !== "require") continue;

      const argsNode = getChildByFieldName(call, "arguments");
      if (!argsNode || argsNode.namedChildren.length === 0) continue;

      const sourceArg = argsNode.namedChildren[0];
      const source = sourceArg.text.replace(/^['"]|['"]$/g, "");

      // Check if result is destructured: const { a, b } = require(...)
      const parent = call.parent;
      if (parent?.type === "variable_declarator") {
        const pattern = getChildByFieldName(parent, "name");
        if (pattern?.type === "object_pattern") {
          for (const prop of pattern.namedChildren) {
            const propName = getChildByFieldName(prop, "name") ?? getChildByFieldName(prop, "value");
            if (propName) imports.push({ file, imported: propName.text, source });
          }
        } else if (pattern?.type === "identifier") {
          imports.push({ file, imported: pattern.text, source });
        }
      }
    }
  }

  if (isPythonExt(ext)) {
    // import X, import X.Y.Z
    for (const stmt of rootNode.descendantsOfType("import_statement") ?? []) {
      const dottedNames = stmt.descendantsOfType("dotted_name") ?? [];
      const aliased = stmt.descendantsOfType("aliased_import") ?? [];

      if (aliased.length > 0) {
        for (const a of aliased) {
          const nameNode = a.namedChildren.find((c: TSNode) => c.type === "dotted_name" || c.type === "identifier");
          const aliasNode = a.namedChildren.find((c: TSNode) => c.type === "identifier" && c !== nameNode);
          imports.push({
            file,
            imported: aliasNode ? aliasNode.text : (nameNode?.text ?? ""),
            source: nameNode?.text ?? "",
          });
        }
      } else {
        for (const d of dottedNames) {
          imports.push({ file, imported: d.text, source: d.text });
        }
      }
    }

    // from X import Y, from X.Y import Z
    for (const stmt of rootNode.descendantsOfType("import_from_statement") ?? []) {
      const moduleNode = stmt.namedChildren.find((c: TSNode) => c.type === "dotted_name" || c.type === "relative_import");
      const source = moduleNode?.text ?? "";

      const names = stmt.namedChildren.filter(
        (c: TSNode) => (c.type === "dotted_name" && c !== moduleNode) || c.type === "aliased_import" || c.type === "identifier"
      );

      for (const nameNode of names) {
        if (nameNode.type === "aliased_import") {
          const original = nameNode.namedChildren.find((c: TSNode) => c.type === "dotted_name" || c.type === "identifier");
          const alias = nameNode.namedChildren.filter((c: TSNode) => c.type === "identifier").pop();
          imports.push({ file, imported: alias ? alias.text : (original?.text ?? ""), source });
        } else if (nameNode.type === "dotted_name" || nameNode.type === "identifier") {
          if (nameNode === moduleNode) continue;
          if (nameNode.text === "import") continue;
          imports.push({ file, imported: nameNode.text, source });
        }
      }
    }
  }

  if (isGoExt(ext)) {
    // Go imports: import "pkg" or import ( "pkg1" "pkg2" )
    for (const spec of rootNode.descendantsOfType("import_spec") ?? []) {
      const pathNode = spec.namedChildren.find((c: TSNode) =>
        c.type === "interpreted_string_literal" || c.type === "raw_string_literal"
      );
      if (pathNode) {
        const importPath = pathNode.text.replace(/^["']|["']$/g, "");
        // Go import name = last segment of path
        const importName = importPath.split("/").pop() ?? importPath;
        imports.push({ file, imported: importName, source: importPath });
      }
    }
  }

  return imports;
}

// ─── Graph builder ──────────────────────────────────────────────

export async function buildCallGraph(root: string): Promise<CallGraph> {
  const files = await walkSourceFiles(root);
  const fileIndex = buildFileIndex(files);
  const functions = new Map<string, FuncDef>();
  const allCalls: CallSite[] = [];
  const allImports: ImportInfo[] = [];

  // Initialize tree-sitter parser once for all files
  let hasParser = false;
  try {
    await getParser();
    hasParser = true;
  } catch {
    // tree-sitter not available, fall back to regex for all files
  }

  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(path.join(root, file), "utf8");
    } catch { continue; }

    const ext = path.extname(file);

    // Try AST-based extraction first
    let usedAST = false;
    if (hasParser) {
      try {
        const lang = await getLanguage(ext);
        if (lang) {
          parser.setLanguage(lang);
          const tree = parser.parse(text);
          const rootNode = tree.rootNode as unknown as TSNode;

          // Extract functions via AST
          const funcs = extractFunctionsAST(rootNode, file, ext);
          for (const func of funcs) {
            const qualified = `${file}:${func.name}`;
            if (!functions.has(qualified)) {
              functions.set(qualified, func);
            }
          }

          // Extract class info for this.method() resolution
          const classInfos = extractClassInfos(rootNode, file);

          // Extract imports via AST
          const imports = extractImportsAST(rootNode, file, ext);
          for (const imp of imports) {
            imp.resolved = resolveImport(imp.source, file, fileIndex);
            allImports.push(imp);
          }

          // Extract calls via AST
          allCalls.push(...extractCallsAST(rootNode, file, funcs, classInfos, ext));

          usedAST = true;
        }
      } catch {
        // AST extraction failed, fall through to regex
      }
    }

    // Regex fallback when no grammar available or AST failed
    if (!usedAST) {
      for (const func of extractFunctionsRegex(text, file)) {
        const qualified = `${file}:${func.name}`;
        if (!functions.has(qualified)) {
          functions.set(qualified, func);
        }
      }

      const imports = extractImportsRegex(text, file);
      for (const imp of imports) {
        imp.resolved = resolveImport(imp.source, file, fileIndex);
        allImports.push(imp);
      }

      allCalls.push(...extractCallsRegex(text, file));
    }
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
