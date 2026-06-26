import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

async function walkFiles(root: string, exts: string[]): Promise<string[]> {
  const SKIP = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "target", "vendor", ".terraform"]);
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (exts.some(ext => e.name.endsWith(ext))) results.push(full);
    }
  }
  await walk(root);
  return results;
}

export async function iacFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "iac") return [];

  // Scan Terraform, Pulumi, CDK, Ansible files
  const tfFiles = await walkFiles(root, [".tf", ".tfvars"]);
  const pyFiles = await walkFiles(root, [".py"]);
  const tsFiles = await walkFiles(root, [".ts", ".js"]);
  const yamlFiles = await walkFiles(root, [".yml", ".yaml"]);
  const allIacFiles = [...tfFiles, ...yamlFiles.filter(f => f.includes("ansible") || f.includes("playbook") || f.includes("roles"))];
  const allCodeFiles = [...pyFiles, ...tsFiles];

  const allIacContent = (await Promise.all(allIacFiles.map(f => readFileContent(root, f)))).join("\n");
  const allCodeContent = (await Promise.all(allCodeFiles.map(f => readFileContent(root, f)))).join("\n");
  const allContent = allIacContent + "\n" + allCodeContent;

  // DK-IAC-001: Hardcoded secrets in infrastructure code
  const hasHardcodedSecrets =
    /password\s*=\s*["'][^"']+["']/.test(allContent) ||
    /secret[_-]?key\s*=\s*["'][^"']+["']/.test(allContent) ||
    /api[_-]?key\s*=\s*["'][^"']+["']/.test(allContent) ||
    /token\s*=\s*["'][^"']+["']/.test(allContent) ||
    /access[_-]?key\s*=\s*["'][^"']+["']/.test(allContent);

  const hasSecretManagement =
    /var\./i.test(allIacContent) ||
    /data\.(aws_secretsmanager|vault_generic_secret|aws_ssm_parameter)/.test(allIacContent) ||
    /secret_manager|secretsmanager|key_vault|vault_/i.test(allContent) ||
    /\$\{var\./.test(allIacContent);

  if (hasHardcodedSecrets && !hasSecretManagement) {
    findings.push({
      ruleId: "DK-IAC-001",
      title: "Hardcoded secrets in infrastructure code",
      severity: "blocker",
      confidence: "high",
      missingControls: ["secretManagement"],
      consequence: "Secrets are committed to version control, exposing credentials to anyone with repo access. Secret rotation requires code changes and redeployment.",
      acceptanceCriteria: [
        "Secrets are stored in a secret manager (AWS Secrets Manager, Vault, etc.).",
        "Infrastructure code references secrets via data sources, not hardcoded values.",
        "Secret values are never committed to version control.",
      ],
      evidence: [{ id: "iac-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["hardcoded secrets detected"] }],
    });
  }

  // DK-IAC-002: State file not encrypted or not in remote backend
  const hasRemoteState =
    /backend\s*["']?(s3|gcs|azurerm|consul|pg|remote)/.test(allIacContent) ||
    /terraform\s*{\s*\n\s*backend/.test(allIacContent);

  const hasStateEncryption =
    /encrypt\s*=\s*true/i.test(allIacContent) ||
    /encryption/i.test(allIacContent) ||
    /sse_algorithm/i.test(allIacContent);

  if (!hasRemoteState) {
    findings.push({
      ruleId: "DK-IAC-002",
      title: "Terraform state stored locally (no remote backend)",
      severity: "blocker",
      confidence: "high",
      missingControls: ["stateEncryption"],
      consequence: "Local state files contain sensitive resource data and credentials. They're not shared across team members, can be lost on machine failure, and aren't encrypted at rest.",
      acceptanceCriteria: [
        "State is stored in a remote backend (S3, GCS, Azure Blob, Consul, etc.).",
        "State file encryption at rest is enabled.",
        "State file access is restricted via IAM policies.",
      ],
      evidence: [{ id: "iac-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["no remote state backend found"] }],
    });
  } else if (!hasStateEncryption) {
    findings.push({
      ruleId: "DK-IAC-003",
      title: "Remote state backend without encryption at rest",
      severity: "high",
      confidence: "medium",
      missingControls: ["stateEncryption"],
      consequence: "State files contain secrets and resource metadata. Without encryption at rest, a storage breach exposes all infrastructure secrets.",
      acceptanceCriteria: [
        "State encryption at rest is enabled on the remote backend.",
        "KMS key rotation is configured.",
        "Access logging is enabled for the state storage.",
      ],
      evidence: [{ id: "iac-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["remote state found but no encryption flag"] }],
    });
  }

  // DK-IAC-004: Overly permissive IAM policies
  const hasOverlyPermissive =
    /["']\*["'].*["']\*["']/.test(allContent) ||
    /Actions?\s*:\s*\[\s*["']\*["']/.test(allContent) ||
    /Resource\s*:\s*\[\s*["']\*["']/.test(allContent) ||
    /iam[_-]?policy.*\*.*\*/i.test(allContent) ||
    /statement\s*{[\s\S]*?actions?\s*=\s*\[\s*"\*"[\s\S]*?resources?\s*=\s*\[\s*"\*"/.test(allContent);

  if (hasOverlyPermissive) {
    findings.push({
      ruleId: "DK-IAC-004",
      title: "Overly permissive IAM policy detected (Action: *, Resource: *)",
      severity: "blocker",
      confidence: "high",
      missingControls: ["leastPrivilege"],
      consequence: "IAM policies granting * on both Action and Resource give full access to all AWS services. A compromised resource can do anything in the account.",
      acceptanceCriteria: [
        "IAM policies grant only the minimum required permissions.",
        "Action and Resource are explicitly specified, not wildcards.",
        "IAM Access Analyzer is used to validate policies.",
      ],
      evidence: [{ id: "iac-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["wildcard IAM policy detected"] }],
    });
  }

  // DK-IAC-005: No resource tagging strategy
  const tfContent = allIacContent;
  const hasTags =
    /tags\s*=/.test(tfContent) ||
    /tags\s*{/.test(tfContent) ||
    /labels\s*=/.test(tfContent);

  const hasResourceBlocks = /resource\s+["']/.test(tfContent);

  if (hasResourceBlocks && !hasTags) {
    findings.push({
      ruleId: "DK-IAC-005",
      title: "Infrastructure resources without tagging",
      severity: "medium",
      confidence: "medium",
      missingControls: ["resourceTagging"],
      consequence: "Untagged resources cannot be attributed to teams, projects, or cost centers. This makes cost allocation, access control, and cleanup impossible at scale.",
      acceptanceCriteria: [
        "All resources have required tags (environment, team, project, cost-center).",
        "A tagging policy or default tags module is enforced.",
        "Untagged resources are detected by automated checks.",
      ],
      evidence: [{ id: "iac-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["resources found without tags"] }],
    });
  }

  // DK-IAC-006: No rollback plan / no destroy protection
  const hasDestroyProtection =
    /prevent_destroy/i.test(allContent) ||
    /deletion_protection/i.test(allContent) ||
    /lifecycle\s*{[\s\S]*?prevent_destroy/.test(allContent);

  const hasCriticalResources =
    /aws_db_instance|aws_rds_cluster|aws_dynamodb_table|aws_elasticache_cluster|aws_s3_bucket/i.test(allContent);

  if (hasCriticalResources && !hasDestroyProtection) {
    findings.push({
      ruleId: "DK-IAC-006",
      title: "Critical resources without deletion protection",
      severity: "high",
      confidence: "medium",
      missingControls: ["rollbackPlan"],
      consequence: "Running `terraform destroy` or a misguided change can delete databases, caches, and storage buckets permanently. Without lifecycle protection, there is no safety net.",
      acceptanceCriteria: [
        "Critical resources (databases, caches, buckets) have `prevent_destroy` lifecycle rule.",
        "Deletion protection is enabled where supported.",
        "Terraform plan output is reviewed before every apply.",
      ],
      evidence: [{ id: "iac-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["critical resources without deletion protection"] }],
    });
  }

  return findings;
}
