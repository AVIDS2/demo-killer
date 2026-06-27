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

export async function staticSiteFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "static-site") return [];
  const files = await walkSourceFiles(root, [".html",".htm",".js",".jsx",".ts",".tsx",".astro",".vue",".svelte"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-STATIC-001: Missing CSP headers
  const hasCspMeta = /meta[^>]*http-equiv[^>]*Content-Security-Policy/i.test(allContent);
  const hasCspHeader = /Content-Security-Policy/i.test(allContent);
  if (!hasCspMeta && !hasCspHeader) {
    findings.push({
      ruleId: "DK-STATIC-001",
      title: "Missing Content-Security-Policy headers",
      severity: "high",
      confidence: "medium",
      missingControls: ["Content-Security-Policy meta tag or header"],
      consequence: "Without a CSP, the site is vulnerable to XSS attacks as the browser has no restrictions on script sources.",
      acceptanceCriteria: [
        "Add a Content-Security-Policy meta tag in the HTML head",
        "Restrict script-src, style-src, and other directives to trusted origins"
      ],
      evidence: [{
        id: "DK-STATIC-001-1",
        detector: "pattern-match",
        location: { path: files[0] || "." },
        controls: [],
        signals: ["No Content-Security-Policy meta tag or header found in any source file"]
      }]
    });
  }

  // DK-STATIC-002: Source map exposure
  const mapFiles = files.filter(f => f.endsWith(".map"));
  const hasSourceMapRef = /sourceMappingURL\s*=/i.test(allContent);
  if (mapFiles.length > 0 || hasSourceMapRef) {
    findings.push({
      ruleId: "DK-STATIC-002",
      title: "Source map exposure in production",
      severity: "high",
      confidence: "medium",
      missingControls: ["Source map removal from production builds"],
      consequence: "Source maps expose original source code, internal paths, and potentially sensitive logic to attackers.",
      acceptanceCriteria: [
        "Remove .map files from production build output",
        "Strip sourceMappingURL comments from bundled JS/CSS",
        "Configure build tool to disable source maps in production"
      ],
      evidence: [{
        id: "DK-STATIC-002-1",
        detector: "pattern-match",
        location: { path: mapFiles.length > 0 ? mapFiles[0] : files[0] || "." },
        controls: [],
        signals: mapFiles.length > 0
          ? [`Found ${mapFiles.length} .map file(s): ${mapFiles.join(", ")}`]
          : ["sourceMappingURL reference found in bundled output"]
      }]
    });
  }

  // DK-STATIC-003: Inline script without nonce
  const scriptTagRegex = /<script(?![^>]*\bnonce\b)[^>]*>/gi;
  const inlineScripts = allContent.match(scriptTagRegex);
  if (inlineScripts && inlineScripts.length > 0) {
    findings.push({
      ruleId: "DK-STATIC-003",
      title: "Inline script tags without nonce attribute",
      severity: "medium",
      confidence: "medium",
      missingControls: ["Nonce or hash-based CSP for inline scripts"],
      consequence: "Inline scripts without nonces cannot be whitelisted by CSP, forcing use of 'unsafe-inline' which weakens XSS protection.",
      acceptanceCriteria: [
        "Add a nonce attribute to all inline <script> tags",
        "Configure CSP to use nonce-based script-src directive",
        "Consider moving inline scripts to external files"
      ],
      evidence: [{
        id: "DK-STATIC-003-1",
        detector: "pattern-match",
        location: { path: files[0] || "." },
        controls: [],
        signals: [`Found ${inlineScripts.length} inline <script> tag(s) without nonce`]
      }]
    });
  }

  // DK-STATIC-004: Tracking pixels / third-party scripts without consent
  const trackingDomains = [
    "tracker.example.com",
    "analytics.google.com",
    "googletagmanager.com",
    "facebook.net",
    "doubleclick.net",
    "hotjar.com",
    "segment.com",
    "mixpanel.com",
    "pixel"
  ];
  const trackingPattern = new RegExp(
    `(?:src|href)\\s*=\\s*["']https?://[^"']*(?:${trackingDomains.map(d => d.replace(/\./g, "\\.")).join("|")})[^"']*["']`,
    "gi"
  );
  const trackingMatches = allContent.match(trackingPattern);
  const hasConsentMechanism = /consent|cookie-banner|gdpr|ccpa|privacy/i.test(allContent);
  if (trackingMatches && trackingMatches.length > 0 && !hasConsentMechanism) {
    findings.push({
      ruleId: "DK-STATIC-004",
      title: "Tracking pixels or third-party scripts without consent mechanism",
      severity: "medium",
      confidence: "medium",
      missingControls: ["User consent mechanism for tracking", "Cookie/tracking consent banner"],
      consequence: "Loading tracking scripts without user consent violates privacy regulations (GDPR, CCPA) and may result in legal liability.",
      acceptanceCriteria: [
        "Implement a cookie/tracking consent banner",
        "Defer loading tracking scripts until user provides consent",
        "Provide opt-out mechanism for tracking"
      ],
      evidence: [{
        id: "DK-STATIC-004-1",
        detector: "pattern-match",
        location: { path: files[0] || "." },
        controls: [],
        signals: [`Found ${trackingMatches.length} tracking resource(s) without consent mechanism: ${trackingMatches.slice(0, 3).join("; ")}`]
      }]
    });
  }

  return findings;
}
