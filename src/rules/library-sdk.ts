import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

// ─── Helpers ──────────────────────────────────────────────────

async function readJson(root: string, file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
  } catch {
    return {};
  }
}

async function readFileContent(root: string, file: string): Promise<string> {
  try {
    return await fs.readFile(path.join(root, file), "utf8");
  } catch {
    return "";
  }
}

async function findSourceFiles(root: string): Promise<string[]> {
  const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "build", "out", "__pycache__", ".venv", "venv", "target", ".git"]);
  const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (SOURCE_EXTS.some(ext => entry.name.endsWith(ext))) {
        results.push(path.relative(root, fullPath).replaceAll("\\", "/"));
      }
    }
  }

  await walk(root);
  return results;
}

// ─── DK-LIB-001: Missing TypeScript type exports ─────────────

async function checkTypeExports(root: string, inventory: ProjectInventory): Promise<Finding | null> {
  if (!inventory.isNpmPackage) return null;

  const pkg = await readJson(root, "package.json");
  const hasTypesField = typeof pkg.types === "string" || typeof pkg.typings === "string";

  if (hasTypesField) return null;

  // For TS projects, also check if tsconfig emits declarations
  let tsconfigEmitsDeclarations = false;
  if (inventory.hasTypeScript) {
    const tsconfig = await readJson(root, "tsconfig.json");
    const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>;
    tsconfigEmitsDeclarations = compilerOptions.declaration === true;
  }

  if (tsconfigEmitsDeclarations) return null;

  const signals: string[] = [];
  if (inventory.hasTypeScript) {
    signals.push("TypeScript project without declaration emission");
  }
  signals.push("missing 'types' or 'typings' field in package.json");

  return {
    ruleId: "DK-LIB-001",
    title: "Library is missing TypeScript type declarations for consumers",
    severity: "high",
    confidence: "high",
    missingControls: ["typeExports"],
    consequence: "Consumers using TypeScript will not get type information, autocomplete, or compile-time error checking when importing this library. This degrades the developer experience and makes adoption harder in TypeScript projects.",
    acceptanceCriteria: [
      "package.json has a \"types\" or \"typings\" field pointing to the declaration entry point.",
      "tsconfig.json has \"declaration\": true to emit .d.ts files during build.",
      "Published package includes .d.ts files alongside the JavaScript output.",
    ],
    evidence: [{
      id: "package-json",
      detector: "filesystem",
      location: { path: "package.json" },
      controls: [],
      signals,
    }],
  };
}

// ─── DK-LIB-002: No error types/classes exported ─────────────

async function checkErrorTypes(root: string, inventory: ProjectInventory): Promise<Finding | null> {
  if (!inventory.isNpmPackage) return null;

  const sourceFiles = await findSourceFiles(root);
  // Filter to src/ or lib/ directory files (skip test files)
  const libFiles = sourceFiles.filter(f =>
    (f.startsWith("src/") || f.startsWith("lib/") || !f.includes("/")) &&
    !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__test")
  );

  if (libFiles.length === 0) return null;

  let hasExportedFunctions = false;
  let hasExportedErrors = false;
  const exportPattern = /\bexport\s+(default\s+)?(async\s+)?function\b|\bexport\s+(const|let|var)\s+\w+\s*=/;
  const errorClassPattern = /\bexport\s+(abstract\s+)?class\s+\w*(Error|Exception)\b/i;

  for (const file of libFiles) {
    const content = await readFileContent(root, file);
    if (errorClassPattern.test(content)) {
      hasExportedErrors = true;
    }
    if (exportPattern.test(content)) {
      hasExportedFunctions = true;
    }
    if (hasExportedFunctions && hasExportedErrors) break;
  }

  if (!hasExportedFunctions || hasExportedErrors) return null;

  return {
    ruleId: "DK-LIB-002",
    title: "Library exports functions but no custom error classes",
    severity: "high",
    confidence: "medium",
    missingControls: ["errorTypeExports"],
    consequence: "Consumers cannot catch specific errors from this library. They are forced to use generic error handling (try/catch on any Error), making it impossible to programmatically distinguish between different failure modes like network errors, validation errors, or auth errors.",
    acceptanceCriteria: [
      "Library exports at least one custom Error or Exception class.",
      "Custom errors extend the native Error class with a descriptive name.",
      "Each distinct failure mode has its own error class so consumers can match on instanceof.",
      "Error classes include relevant context (e.g., status code, field name, input value).",
    ],
    evidence: [{
      id: "source-scan",
      detector: "ast-scan",
      location: { path: "src/" },
      controls: [],
      signals: ["exported functions found but no exported Error/Exception classes"],
    }],
  };
}

// ─── DK-LIB-003: Missing API stability markers ───────────────

async function checkApiStability(root: string, inventory: ProjectInventory): Promise<Finding | null> {
  if (!inventory.isNpmPackage) return null;

  const sourceFiles = await findSourceFiles(root);
  const libFiles = sourceFiles.filter(f =>
    (f.startsWith("src/") || f.startsWith("lib/") || f.startsWith("index.") || !f.includes("/")) &&
    !f.includes(".test.") && !f.includes(".spec.") && !f.includes("__test")
  );

  if (libFiles.length === 0) return null;

  const stabilityPattern = /@(public|beta|alpha|deprecated|internal|experimental|stable)\b/i;
  let hasStabilityAnnotations = false;
  let hasExports = false;

  for (const file of libFiles) {
    const content = await readFileContent(root, file);
    if (stabilityPattern.test(content)) {
      hasStabilityAnnotations = true;
    }
    if (/\bexport\b/.test(content)) {
      hasExports = true;
    }
    if (hasStabilityAnnotations) break;
  }

  if (!hasExports || hasStabilityAnnotations) return null;

  return {
    ruleId: "DK-LIB-003",
    title: "Library has no API stability markers on exports",
    severity: "medium",
    confidence: "medium",
    missingControls: ["apiStabilityMarkers"],
    consequence: "Consumers have no way to know which APIs are stable, beta, or experimental. This makes it risky to adopt the library for production use because any export might change or be removed in a minor release without warning.",
    acceptanceCriteria: [
      "Public API surface has JSDoc/TSDoc annotations (@public, @beta, @alpha).",
      "Deprecated APIs have @deprecated tags with migration guidance.",
      "Experimental APIs are clearly marked so consumers can avoid them in production code.",
    ],
    evidence: [{
      id: "source-scan",
      detector: "ast-scan",
      location: { path: "src/" },
      controls: [],
      signals: ["exports found but no @public/@beta/@alpha/@deprecated annotations"],
    }],
  };
}

// ─── DK-LIB-004: No tree-shaking support ─────────────────────

async function checkTreeShaking(root: string, inventory: ProjectInventory): Promise<Finding | null> {
  if (!inventory.isNpmPackage) return null;

  const pkg = await readJson(root, "package.json");
  const hasSideEffectsField = "sideEffects" in pkg;
  const hasModuleField = typeof pkg.module === "string";
  const hasExportsField = typeof pkg.exports === "object" && pkg.exports !== null;

  // If package has ESM entry (module or exports) AND sideEffects, it's tree-shakeable
  if (hasSideEffectsField && (hasModuleField || hasExportsField)) return null;

  const signals: string[] = [];
  if (!hasSideEffectsField) signals.push("missing 'sideEffects' field");
  if (!hasModuleField && !hasExportsField) signals.push("no ESM entry point (missing 'module' and 'exports' fields)");
  else if (!hasSideEffectsField) signals.push("ESM entry exists but no 'sideEffects' field to enable tree-shaking");

  return {
    ruleId: "DK-LIB-004",
    title: "Library does not support tree-shaking for bundler consumers",
    severity: "medium",
    confidence: "medium",
    missingControls: ["treeShakingSupport"],
    consequence: "Bundlers (webpack, Rollup, esbuild, Vite) cannot eliminate unused exports. Consumers who import a single function will bundle the entire library, inflating their bundle size and hurting page load performance.",
    acceptanceCriteria: [
      "package.json has \"sideEffects\": false (or an array of files with side effects).",
      "package.json has a \"module\" field or \"exports\" map pointing to ESM build output.",
      "Library is published in ESM format alongside CJS for broad compatibility.",
    ],
    evidence: [{
      id: "package-json",
      detector: "filesystem",
      location: { path: "package.json" },
      controls: [],
      signals,
    }],
  };
}

// ─── DK-LIB-005: Missing entry point configuration ───────────

async function checkEntryPoints(root: string, inventory: ProjectInventory): Promise<Finding | null> {
  if (!inventory.isNpmPackage) return null;

  const pkg = await readJson(root, "package.json");
  const hasMain = typeof pkg.main === "string";
  const hasModule = typeof pkg.module === "string";
  const hasExports = typeof pkg.exports === "object" && pkg.exports !== null;
  const hasTypes = typeof pkg.types === "string" || typeof pkg.typings === "string";

  if (hasMain || hasModule || hasExports || hasTypes) return null;

  return {
    ruleId: "DK-LIB-005",
    title: "Library package.json has no entry point configuration",
    severity: "high",
    confidence: "high",
    missingControls: ["entryPointConfiguration"],
    consequence: "Consumers cannot import this library using standard module resolution. Without any entry point field (main, module, exports, or types), Node.js and bundlers will fail to resolve imports or fall back to guessing, which is unreliable across environments.",
    acceptanceCriteria: [
      "package.json has at least one entry point: \"main\" (CJS), \"module\" (ESM), or \"exports\" (conditional).",
      "\"exports\" map is used for dual CJS/ESM support with proper subpath configuration.",
      "\"types\" field points to the TypeScript declaration entry point.",
    ],
    evidence: [{
      id: "package-json",
      detector: "filesystem",
      location: { path: "package.json" },
      controls: [],
      signals: ["no 'main', 'module', 'exports', or 'types' field in package.json"],
    }],
  };
}

// ─── DK-LIB-006: No versioning strategy ──────────────────────

async function checkVersioning(root: string, inventory: ProjectInventory): Promise<Finding | null> {
  if (!inventory.isNpmPackage) return null;

  const pkg = await readJson(root, "package.json");
  const version = typeof pkg.version === "string" ? pkg.version : "";

  const isPlaceholderVersion = version === "0.0.0" || version === "1.0.0";
  if (!isPlaceholderVersion) return null;
  if (inventory.hasChangelog) return null;

  const signals: string[] = [];
  if (version === "0.0.0") {
    signals.push("version is '0.0.0' (never published)");
  } else {
    signals.push("version is '1.0.0' (generic initial version)");
  }
  if (!inventory.hasChangelog) {
    signals.push("no CHANGELOG file found");
  }

  return {
    ruleId: "DK-LIB-006",
    title: "Library has no evidence of a versioning strategy",
    severity: "medium",
    confidence: "medium",
    missingControls: ["versioningStrategy"],
    consequence: "Without semver-aware versioning and a changelog, consumers cannot anticipate breaking changes. They may auto-update to a version that breaks their integration, with no documented migration path.",
    acceptanceCriteria: [
      "package.json version reflects actual release state (not 0.0.0 or 1.0.0 placeholder).",
      "CHANGELOG.md exists and documents breaking changes, new features, and fixes per version.",
      "Major version bumps follow semver for breaking changes.",
    ],
    evidence: [{
      id: "package-json",
      detector: "filesystem",
      location: { path: "package.json" },
      controls: [],
      signals,
    }],
  };
}

// ─── Main entry point ────────────────────────────────────────

export async function librarySdkFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  // Only fire for library/SDK projects or npm packages
  if (inventory.projectKind !== "library-sdk" && !inventory.isNpmPackage) return [];

  const results = await Promise.all([
    checkTypeExports(root, inventory),
    checkErrorTypes(root, inventory),
    checkApiStability(root, inventory),
    checkTreeShaking(root, inventory),
    checkEntryPoints(root, inventory),
    checkVersioning(root, inventory),
  ]);

  return results.filter((f): f is Finding => f !== null);
}
