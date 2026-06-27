import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function walkSourceFiles(root: string, exts: string[]): Promise<string[]> {
  const SKIP = new Set(["node_modules","dist","build",".git","__pycache__","target","vendor"]);
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (exts.some(ext => e.name.endsWith(ext))) results.push(path.relative(root, full));
    }
  }
  await walk(root);
  return results;
}

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

export async function wasmModuleFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "wasm-module") return [];
  const files = await walkSourceFiles(root, [".ts",".tsx",".js",".jsx",".rs",".wat"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-WASM-001: Memory safety - check unsafe/ptr::read/ptr::write/mem::transmute without bounds check/null check
  const unsafeRe = /\b(unsafe|ptr::read|ptr::write|mem::transmute)\b/g;
  const boundsRe = /\b(bounds.*check|null.*check)\b/gi;
  const unsafeMatches = allContent.match(unsafeRe);
  const boundsMatches = allContent.match(boundsRe);
  if (unsafeMatches && (!boundsMatches || boundsMatches.length === 0)) {
    const affectedFiles: string[] = [];
    for (const f of files) {
      const content = await readFileContent(root, f);
      if (unsafeRe.test(content)) affectedFiles.push(f);
      unsafeRe.lastIndex = 0;
    }
    for (const f of affectedFiles) {
      findings.push({
        ruleId: "DK-WASM-001",
        title: "Unsafe memory operations without bounds checking",
        severity: "high",
        confidence: "medium",
        missingControls: ["bounds-checking", "null-checking", "memory-safety-validation"],
        consequence: "Out-of-bounds reads/writes or undefined behavior in WASM execution context can cause memory corruption or security vulnerabilities",
        acceptanceCriteria: [
          "All unsafe blocks must include explicit bounds checks",
          "Pointer dereferences must be preceded by null checks",
          "transmute usage must validate source and target type compatibility"
        ],
        evidence: [{
          id: "DK-WASM-001-1",
          detector: "pattern-match",
          location: { path: f },
          controls: [],
          signals: ["unsafe block found without bounds or null checks"]
        }]
      });
    }
  }

  // DK-WASM-002: Input validation - check exported functions taking &str/JsValue/String without validation
  const exportFnRe = /pub\s+fn\s+\w+\s*\([^)]*(?:&str|JsValue|String)[^)]*\)/g;
  const validationRe = /\b(validat|sanitiz|check.*len)\b/gi;
  const exportMatches = allContent.match(exportFnRe);
  const validationMatches = allContent.match(validationRe);
  if (exportMatches && (!validationMatches || validationMatches.length === 0)) {
    const affectedFiles: string[] = [];
    for (const f of files) {
      const content = await readFileContent(root, f);
      if (exportFnRe.test(content)) affectedFiles.push(f);
      exportFnRe.lastIndex = 0;
    }
    for (const f of affectedFiles) {
      findings.push({
        ruleId: "DK-WASM-002",
        title: "Exported WASM function accepts string input without validation",
        severity: "high",
        confidence: "medium",
        missingControls: ["input-validation", "input-sanitization", "length-checking"],
        consequence: "Unvalidated string inputs to exported WASM functions can lead to buffer overflows, injection attacks, or denial of service",
        acceptanceCriteria: [
          "All exported functions must validate input length before processing",
          "String inputs must be sanitized before use in operations",
          "Input bounds must be checked against expected maximum sizes"
        ],
        evidence: [{
          id: "DK-WASM-002-1",
          detector: "pattern-match",
          location: { path: f },
          controls: [],
          signals: ["exported function accepts &str/JsValue/String without validation keywords"]
        }]
      });
    }
  }

  // DK-WASM-003: Panic handling - check unwrap/expect/panic without catch_unwind/set_panic_hook
  const panicRe = /\b(unwrap\(\)|expect\(|panic!)\b/g;
  const catchRe = /\b(catch_unwind|set_panic_hook)\b/g;
  const panicMatches = allContent.match(panicRe);
  const catchMatches = allContent.match(catchRe);
  if (panicMatches && (!catchMatches || catchMatches.length === 0)) {
    const affectedFiles: string[] = [];
    for (const f of files) {
      const content = await readFileContent(root, f);
      if (panicRe.test(content)) affectedFiles.push(f);
      panicRe.lastIndex = 0;
    }
    for (const f of affectedFiles) {
      findings.push({
        ruleId: "DK-WASM-003",
        title: "Uncaught panics in WASM module",
        severity: "medium",
        confidence: "medium",
        missingControls: ["panic-hook", "catch-unwind", "error-propagation"],
        consequence: "Uncaught panics in WASM modules cause unrecoverable traps that crash the host runtime without useful error information",
        acceptanceCriteria: [
          "WASM module must set a panic hook for error reporting",
          "All fallible operations must use catch_unwind or proper Result-based error handling",
          "unwrap/expect calls must be replaced with proper error propagation"
        ],
        evidence: [{
          id: "DK-WASM-003-1",
          detector: "pattern-match",
          location: { path: f },
          controls: [],
          signals: ["unwrap/expect/panic! found without catch_unwind or set_panic_hook"]
        }]
      });
    }
  }

  return findings;
}
