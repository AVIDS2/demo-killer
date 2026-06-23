import { promises as fs } from "node:fs";
import path from "node:path";

export type StackType = "nextjs" | "express" | "fastify" | "flask" | "fastapi" | "django" | "unknown";

export interface ProjectInventory {
  root: string;
  stack: StackType;
  apiRoutes: string[];
  envExamplePath?: string;
  prismaSchemaPath?: string;
  migrationPaths: string[];
  packageJson: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

async function walk(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist" || entry.name === "__pycache__" || entry.name === ".venv" || entry.name === "venv") continue;

    if (entry.isDirectory()) {
      result.push(...(await walk(root, fullPath)));
    } else {
      result.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }

  return result;
}

const JS_TS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
const PYTHON_EXTS = [".py"];

function isJsTsFile(file: string): boolean {
  return JS_TS_EXTS.some((ext) => file.endsWith(ext));
}

function isPythonFile(file: string): boolean {
  return PYTHON_EXTS.some((ext) => file.endsWith(ext));
}

async function fileContainsJsRoutePattern(root: string, file: string): Promise<boolean> {
  try {
    const text = await fs.readFile(path.join(root, file), "utf8");
    return (
      /\bapp\s*\.\s*(get|post|put|patch|delete)\s*\(/.test(text) ||
      /\brouter\s*\.\s*(get|post|put|patch|delete)\s*\(/.test(text) ||
      /\bfastify\s*\.\s*(get|post|put|patch|delete)\s*\(/.test(text) ||
      /\bfastify\s*\.\s*route\s*\(/.test(text)
    );
  } catch {
    return false;
  }
}

async function fileContainsPythonRoutePattern(root: string, file: string): Promise<boolean> {
  try {
    const text = await fs.readFile(path.join(root, file), "utf8");
    return (
      /@(?:app|router|api)\s*\.\s*(get|post|put|patch|delete|route)\s*\(/.test(text) ||
      /@(?:app|bp)\s*\.\s*route\s*\(/.test(text) ||
      /\bpath\s*\(\s*['"]/.test(text) ||
      /\bre_path\s*\(\s*['"]/.test(text) ||
      /\b@include\s*\(/.test(text) ||
      /@api_view\s*\(/.test(text)
    );
  } catch {
    return false;
  }
}

type PythonDeps = Record<string, string>;

async function readPythonDeps(root: string): Promise<PythonDeps> {
  const deps: PythonDeps = {};

  // requirements.txt
  try {
    const text = await fs.readFile(path.join(root, "requirements.txt"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const name = trimmed.split(/[>=<\[!;]/)[0].trim().toLowerCase();
      if (name) deps[name] = "latest";
    }
  } catch { /* no requirements.txt */ }

  // pyproject.toml (basic parsing — look for dependency names)
  try {
    const text = await fs.readFile(path.join(root, "pyproject.toml"), "utf8");
    const depBlockMatch = text.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depBlockMatch) {
      for (const match of depBlockMatch[1].matchAll(/['"]([a-zA-Z0-9_-]+)/g)) {
        deps[match[1].toLowerCase()] = "latest";
      }
    }
    const poetryMatch = text.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|\n*$)/);
    if (poetryMatch) {
      for (const match of poetryMatch[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm)) {
        deps[match[1].toLowerCase()] = "latest";
      }
    }
  } catch { /* no pyproject.toml */ }

  return deps;
}

function detectJsStack(deps: Record<string, string>, devDeps: Record<string, string>): StackType {
  if (deps.next || devDeps.next) return "nextjs";
  if (deps.fastify || devDeps.fastify) return "fastify";
  if (deps.express || devDeps.express) return "express";
  return "unknown";
}

function detectPythonStack(deps: PythonDeps): StackType {
  if (deps.fastapi) return "fastapi";
  if (deps.django) return "django";
  if (deps.flask) return "flask";
  return "unknown";
}

async function findJsRoutes(root: string, files: string[]): Promise<string[]> {
  const candidates = files.filter((f) => {
    if (!isJsTsFile(f)) return false;
    if (f.includes("node_modules") || f.includes(".next") || f.includes("dist/")) return false;
    if (f.includes("test") || f.includes("spec") || f.includes("__test")) return false;
    return true;
  });

  const results: string[] = [];
  for (const file of candidates) {
    if (await fileContainsJsRoutePattern(root, file)) {
      results.push(file);
    }
  }
  return results;
}

async function findPythonRoutes(root: string, files: string[]): Promise<string[]> {
  const candidates = files.filter((f) => {
    if (!isPythonFile(f)) return false;
    if (f.includes("__pycache__") || f.includes(".venv") || f.includes("venv/")) return false;
    if (f.includes("test") || f.includes("conftest")) return false;
    return true;
  });

  const results: string[] = [];
  for (const file of candidates) {
    if (await fileContainsPythonRoutePattern(root, file)) {
      results.push(file);
    }
  }
  return results;
}

export async function buildInventory(root: string): Promise<ProjectInventory> {
  const files = await walk(root);

  // Try Node.js project
  let packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = { dependencies: {}, devDependencies: {} };
  try {
    packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  } catch { /* no package.json */ }

  const dependencies = packageJson.dependencies ?? {};
  const devDependencies = packageJson.devDependencies ?? {};
  let stack = detectJsStack(dependencies, devDependencies);

  // If not a known JS stack, try Python
  let apiRoutes: string[] = [];
  if (stack !== "unknown") {
    if (stack === "nextjs") {
      apiRoutes = files.filter((file) => file.startsWith("app/api/") && file.endsWith("/route.ts"));
    } else {
      apiRoutes = await findJsRoutes(root, files);
    }
  } else {
    const pythonDeps = await readPythonDeps(root);
    stack = detectPythonStack(pythonDeps);
    if (stack !== "unknown") {
      apiRoutes = await findPythonRoutes(root, files);
    }
  }

  return {
    root,
    stack,
    apiRoutes,
    envExamplePath: files.includes(".env.example") ? ".env.example" : undefined,
    prismaSchemaPath: files.includes("prisma/schema.prisma") ? "prisma/schema.prisma" : undefined,
    migrationPaths: files.filter(
      (file) => file.startsWith("prisma/migrations/") && file.endsWith(".sql"),
    ),
    packageJson: { dependencies, devDependencies },
  };
}
