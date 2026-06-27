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

export async function devopsScriptFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "devops-script") return [];
  const files = await walkSourceFiles(root, [".sh",".bash",".ps1",".py",".ts",".js",".yml",".yaml",".tf",".hcl"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-DEVOPS-001 (blocker,high): Hardcoded secrets in scripts
  {
    const secretPattern = /(?:^|[^A-Za-z_])(?:(?:DB_PASSWORD|DEPLOY_KEY|API_KEY|SECRET_KEY|PRIVATE_KEY|AWS_SECRET|GITHUB_TOKEN|NPM_TOKEN|DOCKER_PASSWORD|SSH_PASSWORD)\s*[=:]\s*['"]?[^'"}\s]{6,})/im;
    const credentialPattern = /(?:^|[^A-Za-z_])(?:(?:password|secret|token|key|credential)\s*[=:]\s*['"][^'"]{6,}['"])/im;
    if (secretPattern.test(allContent) || credentialPattern.test(allContent)) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        if (secretPattern.test(content) || credentialPattern.test(content)) {
          findings.push({
            ruleId: "DK-DEVOPS-001",
            title: "Hardcoded secrets in deployment/DevOps script",
            severity: "blocker",
            confidence: "medium",
            missingControls: [
              "Use environment variables or a secrets manager (Vault, AWS Secrets Manager)",
              "Never commit secrets to scripts or version control",
              "Use .env files excluded from version control for local development"
            ],
            consequence: "Hardcoded secrets in scripts can be discovered by anyone with repository access, leading to unauthorized access to databases, APIs, and infrastructure.",
            acceptanceCriteria: [
              "All secrets are loaded from environment variables or a secrets manager",
              "No hardcoded passwords, tokens, or keys in any script files",
              "Secrets scanning is integrated into the CI/CD pipeline"
            ],
            evidence: [{
              id: "DK-DEVOPS-001-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["Hardcoded password/secret/token/key value detected in script"]
            }]
          });
        }
      }
    }
  }

  // DK-DEVOPS-002 (high,medium): Shell injection via eval/exec with external input
  {
    const injectionPattern = /\beval\s+.*\$\(|\beval\s+.*`|\bexec\s+.*\$\(/m;
    if (injectionPattern.test(allContent)) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        if (injectionPattern.test(content)) {
          findings.push({
            ruleId: "DK-DEVOPS-002",
            title: "Shell injection risk: eval/exec with dynamic input",
            severity: "high",
            confidence: "medium",
            missingControls: [
              "Avoid eval with dynamic input",
              "Use arrays and proper quoting instead of eval",
              "Validate and sanitize all inputs before execution"
            ],
            consequence: "An attacker who controls the input source (env files, external commands, user input) can execute arbitrary code on the host system.",
            acceptanceCriteria: [
              "Remove eval() usage and use safe alternatives (arrays, functions)",
              "All dynamic command construction uses proper quoting",
              "External inputs are validated before use in shell commands"
            ],
            evidence: [{
              id: "DK-DEVOPS-002-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["eval/exec with command substitution ($() or backticks) detected"]
            }]
          });
        }
      }
    }
  }

  // DK-DEVOPS-003 (medium,medium): Unpinned versions in docker/package installs
  {
    const unpinnedDocker = /\bdocker\s+pull\s+\S+:(?:latest|stable|edge|\$)/m;
    const unpinnedApt = /\b(?:apt-get?|yum|apk)\s+install\s+(?!.*=)/m;
    const unpinnedNpm = /\bnpm\s+install\s+(?:-g\s+)?(?!.*@)(?![\.\-\/])/m;
    if (unpinnedDocker.test(allContent) || unpinnedApt.test(allContent) || unpinnedNpm.test(allContent)) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        if (unpinnedDocker.test(content) || unpinnedApt.test(content) || unpinnedNpm.test(content)) {
          findings.push({
            ruleId: "DK-DEVOPS-003",
            title: "Unpinned package/image versions in deployment script",
            severity: "medium",
            confidence: "medium",
            missingControls: [
              "Pin Docker image tags to specific versions (not latest)",
              "Pin system packages to specific versions",
              "Use lockfiles for dependency resolution"
            ],
            consequence: "Unpinned versions can change between deployments, introducing breaking changes, security vulnerabilities, or behavioral differences without notice.",
            acceptanceCriteria: [
              "All Docker images use specific version tags, not latest",
              "System package installs specify exact versions",
              "Reproducible builds are ensured through version pinning"
            ],
            evidence: [{
              id: "DK-DEVOPS-003-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["docker pull with :latest or missing version tag", "or unpinned apt/yum/npm install"]
            }]
          });
        }
      }
    }
  }

  // DK-DEVOPS-004 (high,medium): curl|bash / wget|sh pattern
  {
    const curlBashPattern = /\bcurl\b.*\|\s*(?:ba)?sh\b|\bwget\b.*\|\s*(?:ba)?sh\b|\bcurl\b.*&&\s*(?:ba)?sh\b|\bwget\b.*&&\s*(?:ba)?sh\b/m;
    if (curlBashPattern.test(allContent)) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        if (curlBashPattern.test(content)) {
          findings.push({
            ruleId: "DK-DEVOPS-004",
            title: "Remote code execution: curl/wget piped or chained to shell",
            severity: "high",
            confidence: "medium",
            missingControls: [
              "Download scripts first, verify checksum, then execute",
              "Use signed artifacts from a trusted registry",
              "Pin the URL to a specific commit hash or version"
            ],
            consequence: "If the remote server is compromised or the connection is intercepted, arbitrary code can be executed on the host with the privileges of the running user.",
            acceptanceCriteria: [
              "Download scripts to a temporary file first",
              "Verify the file's checksum or signature before execution",
              "Pin download URLs to specific versions or commit hashes"
            ],
            evidence: [{
              id: "DK-DEVOPS-004-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["curl or wget output piped to or chained with shell execution"]
            }]
          });
        }
      }
    }
  }

  return findings;
}
