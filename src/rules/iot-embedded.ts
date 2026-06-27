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

export async function iotEmbeddedFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "iot-embedded") return [];
  const files = await walkSourceFiles(root, [".c",".cpp",".h",".hpp",".ino",".py",".ts",".js"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-IOT-001 (blocker,high): Hardcoded credentials
  // Check ssid/password/api_key/token with hardcoded string values
  const credentialPattern = /(ssid|password|api_key|token|secret|wifi_pass)\s*=\s*["'][^"']+["']/gi;
  const credentialFiles = new Map<string, string[]>();
  for (const file of files) {
    const content = await readFileContent(root, file);
    const matches = content.match(credentialPattern);
    if (matches) {
      credentialFiles.set(file, matches);
    }
  }
  if (credentialFiles.size > 0) {
    findings.push({
      ruleId: "DK-IOT-001",
      title: "Hardcoded credentials detected in source code",
      severity: "blocker",
      confidence: "medium",
      missingControls: ["Credential rotation mechanism", "Secure key storage (e.g., NVS, TPM, secure enclave)", "Environment-variable or compile-time injection"],
      consequence: "Credentials exposed in version control or firmware binary can be extracted by attackers, leading to unauthorized device access or network compromise.",
      acceptanceCriteria: [
        "No plaintext credentials in source code",
        "Credentials loaded from secure storage or environment at runtime",
        "Default/placeholder values documented as non-production"
      ],
      evidence: [...credentialFiles.entries()].map(([file, signals]) => ({
        id: `iot-001-${file}`,
        detector: "pattern-match",
        location: { path: file },
        controls: [],
        signals
      }))
    });
  }

  // DK-IOT-002 (high,medium): Insecure transport
  // Check http:// URLs (not https://) for API/server connections
  const insecureUrlPattern = /["']http:\/\/[^"']+["']/gi;
  const insecureUrlFiles = new Map<string, string[]>();
  for (const file of files) {
    const content = await readFileContent(root, file);
    const matches = content.match(insecureUrlPattern);
    if (matches) {
      insecureUrlFiles.set(file, matches);
    }
  }
  if (insecureUrlFiles.size > 0) {
    findings.push({
      ruleId: "DK-IOT-002",
      title: "Insecure transport - HTTP used instead of HTTPS",
      severity: "high",
      confidence: "medium",
      missingControls: ["TLS/HTTPS for all network communications", "Certificate validation", "Secure transport layer"],
      consequence: "Data transmitted over HTTP can be intercepted, modified, or replayed by attackers on the network (MITM attacks).",
      acceptanceCriteria: [
        "All API/server URLs use https:// protocol",
        "Certificate pinning implemented where feasible",
        "HTTP fallback disabled or restricted to local-only endpoints"
      ],
      evidence: [...insecureUrlFiles.entries()].map(([file, signals]) => ({
        id: `iot-002-${file}`,
        detector: "pattern-match",
        location: { path: file },
        controls: [],
        signals
      }))
    });
  }

  // DK-IOT-003 (high,medium): No secure boot / firmware signing
  // Check OTA/update/upload without sign/verify/hash/checksum/signature
  const otaPattern = /(ota|update|upload|firmware)[^;]*;/gi;
  const signingPattern = /(sign|verify|hash|checksum|signature|digest)/i;
  const otaFiles = new Map<string, string[]>();
  for (const file of files) {
    const content = await readFileContent(root, file);
    const otaMatches = content.match(otaPattern);
    if (otaMatches && !signingPattern.test(content)) {
      otaFiles.set(file, otaMatches);
    }
  }
  if (otaFiles.size > 0) {
    findings.push({
      ruleId: "DK-IOT-003",
      title: "OTA/firmware update without signing or verification",
      severity: "high",
      confidence: "medium",
      missingControls: ["Firmware signature verification", "Secure boot chain", "Update integrity checks (hash/checksum)"],
      consequence: "Unsigned firmware updates can be replaced by malicious payloads, allowing complete device takeover.",
      acceptanceCriteria: [
        "Firmware images signed with a verified key before deployment",
        "Device verifies signature before applying updates",
        "Secure boot chain prevents execution of unsigned code"
      ],
      evidence: [...otaFiles.entries()].map(([file, signals]) => ({
        id: `iot-003-${file}`,
        detector: "pattern-match",
        location: { path: file },
        controls: [],
        signals
      }))
    });
  }

  // DK-IOT-004 (medium,medium): No input bounds checking
  // Check read/scanf/gets/recv without bounds/length/size/limit validation
  const unsafeInputPattern = /(scanf\s*\(\s*%s|gets\s*\(|recv\s*\([^)]+\))/gi;
  const boundsPattern = /(bounds|length|size|limit|max_len|bufsize|sizeof|strncpy|snprintf|fgets)/i;
  const unsafeInputFiles = new Map<string, string[]>();
  for (const file of files) {
    const content = await readFileContent(root, file);
    const unsafeMatches = content.match(unsafeInputPattern);
    if (unsafeMatches && !boundsPattern.test(content)) {
      unsafeInputFiles.set(file, unsafeMatches);
    }
  }
  if (unsafeInputFiles.size > 0) {
    findings.push({
      ruleId: "DK-IOT-004",
      title: "Unsafe input operations without bounds checking",
      severity: "medium",
      confidence: "medium",
      missingControls: ["Buffer size limits on input operations", "Safe input functions (fgets, strncpy, snprintf)", "Input validation and sanitization"],
      consequence: "Unbounded input operations can cause buffer overflows, leading to crashes, data corruption, or remote code execution on the device.",
      acceptanceCriteria: [
        "All input operations use bounded variants (fgets instead of gets, snprintf instead of sprintf)",
        "Buffer sizes validated before use",
        "Input length checked against maximum expected values"
      ],
      evidence: [...unsafeInputFiles.entries()].map(([file, signals]) => ({
        id: `iot-004-${file}`,
        detector: "pattern-match",
        location: { path: file },
        controls: [],
        signals
      }))
    });
  }

  return findings;
}
