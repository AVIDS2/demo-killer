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

export async function cicdPipelineFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "cicd-pipeline") return [];
  const files = await walkSourceFiles(root, [".yml",".yaml",".json"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-CICD-001: Secrets in pipeline - hardcoded passwords, secrets, tokens, api keys, credentials
  const secretPatterns =
    /(?:password|secret|token|api[_-]?key|credentials)\s*[:=]\s*["'][^"']+["']/i.test(allContent) ||
    /(?:password|secret|token|api[_-]?key|credentials)\s*[:=]\s*\$\{[^}]+\}/i.test(allContent);

  if (secretPatterns) {
    findings.push({
      ruleId: "DK-CICD-001",
      title: "Secrets in pipeline configuration",
      severity: "blocker",
      confidence: "medium",
      missingControls: ["secretManagement"],
      consequence: "Hardcoded secrets in pipeline files are committed to version control, exposing credentials to anyone with repository access. Secret rotation requires code changes and risks accidental exposure in build logs.",
      acceptanceCriteria: [
        "Secrets are stored in the CI platform's secret manager (GitHub Actions secrets, GitLab CI variables, etc.).",
        "Pipeline files reference secrets via environment variable bindings, not hardcoded values.",
        "Secret values are never committed to version control.",
      ],
      evidence: [{
        id: "cicd-scan",
        detector: "pattern-match",
        location: { path: "." },
        controls: [],
        signals: ["hardcoded secret or credential value found in pipeline configuration"],
      }],
    });
  }

  // DK-CICD-002: Unpinned actions - uses: owner/repo@main or @master
  const unpinnedActions =
    /uses:\s*\S+\/\S+@(?:main|master)\b/.test(allContent) ||
    /uses:\s*["']\S+\/\S+@(?:main|master)\b["']/.test(allContent);

  if (unpinnedActions) {
    findings.push({
      ruleId: "DK-CICD-002",
      title: "Unpinned GitHub Actions using mutable branch references",
      severity: "high",
      confidence: "medium",
      missingControls: ["actionPinning"],
      consequence: "Actions pinned to mutable branches (main, master) can be silently updated by the action author. A compromised or buggy upstream action will affect all pipeline runs without any change to the repository.",
      acceptanceCriteria: [
        "All third-party actions are pinned to a specific version tag (e.g., @v3) or a full commit SHA.",
        "Dependabot or Renovate is configured to update action pins automatically.",
        "Action versions are reviewed before updating.",
      ],
      evidence: [{
        id: "cicd-scan",
        detector: "pattern-match",
        location: { path: "." },
        controls: [],
        signals: ["action pinned to @main or @master branch instead of a version tag or SHA"],
      }],
    });
  }

  // DK-CICD-003: No artifact signing - publish/deploy/release without sign/gpg/cosign/sigstore/provenance/sbom
  const hasPublishStep =
    /\b(?:publish|deploy|release|push)\b/i.test(allContent) &&
    !/\b(?:sign|gpg|cosign|sigstore|provenance|sbom)\b/i.test(allContent);

  if (hasPublishStep) {
    findings.push({
      ruleId: "DK-CICD-003",
      title: "Artifact publishing without signing or provenance attestation",
      severity: "medium",
      confidence: "medium",
      missingControls: ["artifactSigning"],
      consequence: "Published artifacts lack cryptographic signatures or provenance attestations. Downstream consumers cannot verify artifact integrity or origin, making supply-chain attacks undetectable.",
      acceptanceCriteria: [
        "Published artifacts are signed with cosign, GPG, or an equivalent signing mechanism.",
        "Build provenance or SBOM is generated and attached to each release.",
        "Consumer-side verification is documented or enforced.",
      ],
      evidence: [{
        id: "cicd-scan",
        detector: "pattern-match",
        location: { path: "." },
        controls: [],
        signals: ["publish/deploy/release step found without signing, provenance, or SBOM"],
      }],
    });
  }

  return findings;
}
