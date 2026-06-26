import { promises as fs } from "node:fs";
import path from "node:path";
import { detectProjectKind, type ProjectKind } from "./project-kind.js";

export type StackType =
  | "nextjs" | "express" | "fastify"
  | "flask" | "fastapi" | "django"
  | "gin" | "echo" | "fiber"
  | "actix" | "axum"
  | "spring-boot"
  | "laravel" | "rails" | "sinatra"
  | "aspnet" | "vapor" | "rocket" | "shelf"
  | "echo-kt" | "ktor"
  | "http4s" | "akka"
  | "unknown";

export interface ProjectInventory {
  root: string;
  stack: StackType;
  projectKind: ProjectKind;
  apiRoutes: string[];
  envExamplePath?: string;
  prismaSchemaPath?: string;
  migrationPaths: string[];
  hasDockerfile: boolean;
  hasTests: boolean;
  hasTypeScript: boolean;
  tsStrictMode: boolean;
  hasReadme: boolean;
  hasLicense: boolean;
  hasChangelog: boolean;
  isNpmPackage: boolean;
  npmFilesField: boolean;
  packageJson: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

const SKIP_DIRS = new Set([
  "node_modules", ".next", "dist", "__pycache__", ".venv", "venv",
  "target", "vendor", ".git", "build", "out", "bin", "obj",
]);

async function walk(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walk(root, fullPath)));
    } else {
      result.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }

  return result;
}

// ─── Extension sets ──────────────────────────────────────────────

const JS_TS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
const PYTHON_EXTS = [".py"];
const GO_EXTS = [".go"];
const RUST_EXTS = [".rs"];
const JAVA_EXTS = [".java"];
const KOTLIN_EXTS = [".kt", ".kts"];
const SCALA_EXTS = [".scala", ".sc"];
const CS_EXTS = [".cs"];
const PHP_EXTS = [".php"];
const RUBY_EXTS = [".rb"];
const SWIFT_EXTS = [".swift"];
const C_EXTS = [".c", ".h"];
const CPP_EXTS = [".cpp", ".cxx", ".cc", ".hpp"];
const LUA_EXTS = [".lua"];
const SHELL_EXTS = [".sh", ".bash", ".zsh"];
const DART_EXTS = [".dart"];
const ZIG_EXTS = [".zig"];

const ALL_CODE_EXTS = [
  ...JS_TS_EXTS, ...PYTHON_EXTS, ...GO_EXTS, ...RUST_EXTS, ...JAVA_EXTS,
  ...KOTLIN_EXTS, ...SCALA_EXTS, ...CS_EXTS, ...PHP_EXTS, ...RUBY_EXTS,
  ...SWIFT_EXTS, ...C_EXTS, ...CPP_EXTS, ...LUA_EXTS, ...SHELL_EXTS,
  ...DART_EXTS, ...ZIG_EXTS,
];

function matchesExts(file: string, exts: string[]): boolean {
  return exts.some((ext) => file.endsWith(ext));
}

// ─── Route pattern matchers ──────────────────────────────────────

async function fileContainsPattern(root: string, file: string, patterns: RegExp[]): Promise<boolean> {
  try {
    const text = await fs.readFile(path.join(root, file), "utf8");
    return patterns.some((p) => p.test(text));
  } catch {
    return false;
  }
}

const ROUTE_PATTERNS: Record<string, RegExp[]> = {
  js: [/\bapp\s*\.\s*(get|post|put|patch|delete)\s*\(/, /\brouter\s*\.\s*(get|post|put|patch|delete)\s*\(/, /\bfastify\s*\.\s*(get|post|put|patch|delete)\s*\(/],
  python: [/@(?:app|router|api)\s*\.\s*(get|post|put|patch|delete|route)\s*\(/, /@(?:app|bp)\s*\.\s*route\s*\(/, /\bpath\s*\(\s*['"]/, /@api_view\s*\(/],
  go: [/\b[re]\s*\.\s*(GET|POST|PUT|PATCH|DELETE)\s*\(/, /\bapp\s*\.\s*(Get|Post|Put|Delete)\s*\(/, /\brouter\s*\.\s*Handle\s*\(/],
  rust: [/#\[(get|post|put|delete)\s*\(/, /\.route\s*\(\s*["']/],
  java: [/@(Get|Post|Put|Delete|Request)Mapping\s*\(/, /@RestController/],
  kotlin: [/@(Get|Post|Put|Delete|Request)Mapping\s*\(/, /\broute\s*\(/],
  scala: [/@(Get|Post|Put|Delete)\s*\(/, /\bget\s*\(\s*["']/, /\bpost\s*\(\s*["']/],
  cs: [/\[Http(Get|Post|Put|Delete)\b/, /\[Route\s*\(/, /\[ApiController\]/],
  php: [/Route::(get|post|put|delete|any)\s*\(/, /\$app->(get|post|put|delete)\s*\(/, /#\[Route/],
  ruby: [/\b(get|post|put|delete|patch)\s+['"]\//, /\brouter\s+/, /\bresources?\s*:/, /\bclass\s+\w+Controller\b/],
  swift: [/\bapp\s*\.\s*(get|post|put|delete)\s*\(/, /\brouter\s*\./],
  c: [/\bcgi_handle_request\s*\(/],
  cpp: [/\bserver\.(get|post|put|delete)\s*\(/],
  dart: [/\bapp\.(get|post|put|delete)\s*\(/, /\brouter\.(get|post)\s*\(/],
  zig: [/\brouter\.(get|post|put|delete)\s*\(/],
  lua: [/\bapp:(get|post|put|delete)\s*\(/],
  shell: [/\bcurl\s+-X\s+(GET|POST|PUT|DELETE)/],
};

const EXTS_FOR_PATTERN: Record<string, string[]> = {
  js: JS_TS_EXTS, python: PYTHON_EXTS, go: GO_EXTS, rust: RUST_EXTS,
  java: JAVA_EXTS, kotlin: KOTLIN_EXTS, scala: SCALA_EXTS, cs: CS_EXTS,
  php: PHP_EXTS, ruby: RUBY_EXTS, swift: SWIFT_EXTS, c: C_EXTS,
  cpp: CPP_EXTS, dart: DART_EXTS, zig: ZIG_EXTS, lua: LUA_EXTS, shell: SHELL_EXTS,
};

async function findRoutes(root: string, files: string[], lang: string): Promise<string[]> {
  const exts = EXTS_FOR_PATTERN[lang] ?? [];
  const patterns = ROUTE_PATTERNS[lang] ?? [];
  if (exts.length === 0 || patterns.length === 0) return [];

  const candidates = files.filter((f) => {
    if (!matchesExts(f, exts)) return false;
    if (f.includes("test") || f.includes("spec") || f.includes("Test.") || f.includes("_test.") || f.includes("conftest")) return false;
    return true;
  });

  const results: string[] = [];
  for (const file of candidates) {
    if (await fileContainsPattern(root, file, patterns)) {
      results.push(file);
    }
  }
  return results;
}

// ─── Dependency parsers ──────────────────────────────────────────

type DepMap = Record<string, string>;

async function readJsonDeps(root: string, file: string): Promise<DepMap> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
    return { ...data.dependencies, ...data.devDependencies };
  } catch { return {}; }
}

async function readFileDeps(root: string, file: string, regex: RegExp): Promise<DepMap> {
  try {
    const text = await fs.readFile(path.join(root, file), "utf8");
    const deps: DepMap = {};
    for (const m of text.matchAll(regex)) deps[m[1].toLowerCase()] = "latest";
    return deps;
  } catch { return {}; }
}

async function readGoDeps(root: string): Promise<DepMap> {
  return readFileDeps(root, "go.mod", /^\s*([a-z0-9./-]+)\s+v/gm);
}

async function readCargoDeps(root: string): Promise<DepMap> {
  try {
    const text = await fs.readFile(path.join(root, "Cargo.toml"), "utf8");
    const section = text.match(/\[dependencies\]([\s\S]*?)(?:\n\[|\n*$)/);
    const deps: DepMap = {};
    if (section) {
      for (const m of section[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm)) deps[m[1].toLowerCase()] = "latest";
    }
    return deps;
  } catch { return {}; }
}

async function readGradleDeps(root: string): Promise<DepMap> {
  const deps: DepMap = {};
  for (const file of ["build.gradle", "build.gradle.kts"]) {
    try {
      const text = await fs.readFile(path.join(root, file), "utf8");
      if (text.includes("spring-boot") || text.includes("org.springframework.boot")) deps["spring-boot"] = "latest";
      if (text.includes("io.ktor")) deps["ktor"] = "latest";
      if (text.includes("com.typesafe.akka")) deps["akka"] = "latest";
    } catch { /* no file */ }
  }
  try {
    const text = await fs.readFile(path.join(root, "pom.xml"), "utf8");
    if (text.includes("spring-boot") || text.includes("spring-boot-starter")) deps["spring-boot"] = "latest";
    if (text.includes("http4s")) deps["http4s"] = "latest";
  } catch { /* no file */ }
  return deps;
}

async function readPythonDeps(root: string): Promise<DepMap> {
  const deps: DepMap = {};
  for (const line of (await readFileContent(root, "requirements.txt")).split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith("#")) deps[t.split(/[>=<\[!;]/)[0].trim().toLowerCase()] = "latest";
  }
  const pyproj = await readFileContent(root, "pyproject.toml");
  const m = pyproj.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (m) for (const x of m[1].matchAll(/['"]([a-zA-Z0-9_-]+)/g)) deps[x[1].toLowerCase()] = "latest";
  return deps;
}

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

async function readPhpDeps(root: string): Promise<DepMap> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(root, "composer.json"), "utf8"));
    return { ...data.require, ...data["require-dev"] };
  } catch { return {}; }
}

async function readRubyDeps(root: string): Promise<DepMap> {
  const text = await readFileContent(root, "Gemfile");
  const deps: DepMap = {};
  for (const m of text.matchAll(/gem\s+['"]([a-zA-Z0-9_-]+)['"]/g)) deps[m[1].toLowerCase()] = "latest";
  return deps;
}

async function readSwiftDeps(root: string): Promise<DepMap> {
  const text = await readFileContent(root, "Package.swift");
  const deps: DepMap = {};
  if (text.includes("vapor")) deps["vapor"] = "latest";
  if (text.includes("Kitura")) deps["kitura"] = "latest";
  return deps;
}

async function readCsDeps(root: string): Promise<DepMap> {
  const deps: DepMap = {};
  for (const file of (await fs.readdir(root)).filter(f => f.endsWith(".csproj"))) {
    const text = await readFileContent(root, file);
    if (text.includes("Microsoft.AspNetCore") || text.includes("Microsoft.NET.Sdk.Web")) deps["aspnet"] = "latest";
  }
  return deps;
}

async function readZigDeps(root: string): Promise<DepMap> {
  return {}; // Zig has no standard package manager yet
}

// ─── Stack detection ─────────────────────────────────────────────

function detectJsStack(d: DepMap): StackType {
  if (d.next) return "nextjs";
  if (d.fastify) return "fastify";
  if (d.express) return "express";
  return "unknown";
}
function detectPythonStack(d: DepMap): StackType {
  if (d.fastapi) return "fastapi";
  if (d.django) return "django";
  if (d.flask) return "flask";
  return "unknown";
}
function detectGoStack(d: DepMap): StackType {
  if (d["github.com/gin-gonic/gin"]) return "gin";
  if (d["github.com/labstack/echo"]) return "echo";
  if (d["github.com/gofiber/fiber"]) return "fiber";
  return "unknown";
}
function detectRustStack(d: DepMap): StackType {
  if (d["actix-web"]) return "actix";
  if (d["axum"]) return "axum";
  if (d["rocket"]) return "rocket";
  return "unknown";
}
function detectJavaStack(d: DepMap): StackType {
  if (d["spring-boot"]) return "spring-boot";
  return "unknown";
}
function detectKotlinStack(d: DepMap): StackType {
  if (d["ktor"]) return "ktor";
  if (d["spring-boot"]) return "spring-boot";
  return "unknown";
}
function detectScalaStack(d: DepMap): StackType {
  if (d["http4s"]) return "http4s";
  if (d["akka"]) return "akka";
  return "unknown";
}
function detectPhpStack(d: DepMap): StackType {
  if (d["laravel/framework"]) return "laravel";
  return "unknown";
}
function detectRubyStack(d: DepMap): StackType {
  if (d["rails"]) return "rails";
  if (d["sinatra"]) return "sinatra";
  return "unknown";
}
function detectSwiftStack(d: DepMap): StackType {
  if (d["vapor"]) return "vapor";
  return "unknown";
}
function detectCsStack(d: DepMap): StackType {
  if (d["aspnet"]) return "aspnet";
  return "unknown";
}

async function readKotlinDeps(root: string): Promise<DepMap> {
  const deps: DepMap = {};
  try {
    const text = await fs.readFile(path.join(root, "build.gradle.kts"), "utf8");
    if (text.includes("spring-boot")) deps["spring-boot"] = "latest";
    if (text.includes("ktor")) deps["ktor"] = "latest";
  } catch {}
  try {
    const text = await fs.readFile(path.join(root, "build.gradle"), "utf8");
    if (text.includes("spring-boot")) deps["spring-boot"] = "latest";
  } catch {}
  return deps;
}

async function readDartDeps(root: string): Promise<DepMap> {
  const deps: DepMap = {};
  try {
    const text = await fs.readFile(path.join(root, "pubspec.yaml"), "utf8");
    if (text.includes("shelf")) deps["shelf"] = "latest";
  } catch {}
  return deps;
}
function detectDartStack(d: DepMap): StackType {
  if (d["shelf"]) return "shelf";
  return "unknown";
}

// ─── Main inventory builder ──────────────────────────────────────

type DetectorResult = { stack: StackType; lang: string; deps: DepMap };

async function tryDetect(root: string): Promise<DetectorResult> {
  // JS/TS
  let deps: DepMap = {};
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {}
  let stack = detectJsStack(deps);
  if (stack !== "unknown") return { stack, lang: "js", deps };

  // Python
  deps = await readPythonDeps(root);
  stack = detectPythonStack(deps);
  if (stack !== "unknown") return { stack, lang: "python", deps };

  // Go
  deps = await readGoDeps(root);
  stack = detectGoStack(deps);
  if (stack !== "unknown") return { stack, lang: "go", deps };

  // Rust
  deps = await readCargoDeps(root);
  stack = detectRustStack(deps);
  if (stack !== "unknown") return { stack, lang: "rust", deps };

  // Java/Kotlin/Scala
  deps = await readGradleDeps(root);
  stack = detectJavaStack(deps);
  if (stack !== "unknown") return { stack, lang: "java", deps };
  stack = detectKotlinStack(deps);
  if (stack !== "unknown") return { stack, lang: "kotlin", deps };
  stack = detectScalaStack(deps);
  if (stack !== "unknown") return { stack, lang: "scala", deps };

  // PHP
  deps = await readPhpDeps(root);
  stack = detectPhpStack(deps);
  if (stack !== "unknown") return { stack, lang: "php", deps };

  // Ruby
  deps = await readRubyDeps(root);
  stack = detectRubyStack(deps);
  if (stack !== "unknown") return { stack, lang: "ruby", deps };

  // Swift
  deps = await readSwiftDeps(root);
  stack = detectSwiftStack(deps);
  if (stack !== "unknown") return { stack, lang: "swift", deps };

  // C#
  deps = await readCsDeps(root);
  stack = detectCsStack(deps);
  if (stack !== "unknown") return { stack, lang: "cs", deps };

  // Kotlin
  deps = await readKotlinDeps(root);
  stack = detectKotlinStack(deps);
  if (stack !== "unknown") return { stack, lang: "kotlin", deps };

  // Dart
  deps = await readDartDeps(root);
  stack = detectDartStack(deps);
  if (stack !== "unknown") return { stack, lang: "dart", deps };

  return { stack: "unknown", lang: "unknown", deps: {} };
}

export async function buildInventory(root: string): Promise<ProjectInventory> {
  const files = await walk(root);
  const hasDockerfile = files.some((f) => f === "Dockerfile" || f.endsWith("/Dockerfile"));
  let detected = await tryDetect(root);

  // C++ fallback: check file extensions
  if (detected.lang === "unknown") {
    const hasCppFiles = files.some(f => f.endsWith(".cpp") || f.endsWith(".hpp") || f.endsWith(".h") || f.endsWith(".cc"));
    if (hasCppFiles) detected = { stack: "unknown", lang: "cpp", deps: {} };
  }

  let apiRoutes: string[] = [];

  if (detected.lang === "js") {
    apiRoutes = detected.stack === "nextjs"
      ? files.filter((f) => f.startsWith("app/api/") && f.endsWith("/route.ts"))
      : await findRoutes(root, files, "js");
  } else {
    apiRoutes = await findRoutes(root, files, detected.lang);
  }

  // Read package.json for the inventory (even for non-JS projects, it might exist)
  let packageJson: { name?: string; dependencies?: DepMap; devDependencies?: DepMap; files?: string[]; private?: boolean } = {};
  try {
    packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  } catch { /* no package.json */ }

  const lowerFiles = files.map(f => f.toLowerCase());
  const hasTests = files.some(f =>
    f.includes("__test") || f.includes(".test.") || f.includes(".spec.") ||
    f.includes("tests/") || f.includes("test/") || f.includes("spec/") ||
    f.endsWith("_test.go") || f.endsWith("_test.py") || f.endsWith("Test.java") || f.endsWith("Spec.scala")
  );
  const hasTypeScript = files.some(f => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".mts"));
  const tsStrictMode = await checkTsStrict(root);
  const hasReadme = lowerFiles.some(f => f.startsWith("readme."));
  const hasLicense = lowerFiles.some(f => f === "license" || f.startsWith("license.") || f === "licence" || f.startsWith("licence."));
  const hasChangelog = lowerFiles.some(f => f.startsWith("changelog."));
  const isNpmPackage = !!(packageJson.name && packageJson.private !== true);
  const npmFilesField = Array.isArray(packageJson.files);
  const allDeps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  const projectKind = detected.stack === "unknown" ? detectProjectKind(allDeps, files) : "web-app";

  return {
    root,
    stack: detected.stack,
    apiRoutes,
    envExamplePath: files.includes(".env.example") ? ".env.example" : undefined,
    prismaSchemaPath: files.includes("prisma/schema.prisma") ? "prisma/schema.prisma" : undefined,
    migrationPaths: files.filter((f) => f.startsWith("prisma/migrations/") && f.endsWith(".sql")),
    hasDockerfile,
    hasTests,
    hasTypeScript,
    tsStrictMode,
    hasReadme,
    hasLicense,
    hasChangelog,
    isNpmPackage,
    npmFilesField,
    projectKind,
    packageJson: { dependencies: packageJson.dependencies ?? {}, devDependencies: packageJson.devDependencies ?? {} },
  };
}

async function checkTsStrict(root: string): Promise<boolean> {
  try {
    const text = await fs.readFile(path.join(root, "tsconfig.json"), "utf8");
    const config = JSON.parse(text);
    return config.compilerOptions?.strict === true;
  } catch {
    return false;
  }
}
