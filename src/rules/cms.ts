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

export async function cmsFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "cms") return [];
  const files = await walkSourceFiles(root, [".ts",".tsx",".js",".jsx",".py",".php"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // DK-CMS-001 (blocker,high): SQL/NoSQL injection - check query with user input (ctx.query/ctx.params/req.body) without sanitiz/validat/escape/ORM
  {
    const injectionPattern = /(?:strapi\.db\.query|\.query\(|\.findMany|\.findOne|\.delete|\.update|\.create)\s*\([^)]*?(?:ctx\.query|ctx\.params|req\.body|req\.query|req\.params)[^)]*?\)/g;
    const hasSanitization = /sanitiz|validat|escape|parameterize|prepared/i.test(allContent);
    if (injectionPattern.test(allContent) && !hasSanitization) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        const filePattern = /(?:strapi\.db\.query|\.query\(|\.findMany|\.findOne|\.delete|\.update|\.create)\s*\([^)]*?(?:ctx\.query|ctx\.params|req\.body|req\.query|req\.params)[^)]*?\)/g;
        if (filePattern.test(content)) {
          findings.push({
            ruleId: "DK-CMS-001",
            title: "SQL/NoSQL injection risk: user input passed to database query without sanitization",
            severity: "blocker",
            confidence: "medium",
            missingControls: ["Input sanitization", "Input validation", "Query parameterization", "ORM-based query building"],
            consequence: "An attacker can manipulate database queries to extract, modify, or delete arbitrary data, potentially gaining full control of the application.",
            acceptanceCriteria: [
              "All database queries use parameterized statements or an ORM with built-in escaping",
              "User input is validated and sanitized before being used in any query context",
              "Input validation rejects unexpected characters and patterns"
            ],
            evidence: [{
              id: "DK-CMS-001-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["User input from ctx.query/ctx.params/req.body used directly in database query", "No sanitization, validation, or escape functions detected in codebase"]
            }]
          });
        }
      }
    }
  }

  // DK-CMS-002 (high,medium): Unrestricted admin access - check admin/api routes without auth/role/permission check
  {
    const adminRoutePattern = /(?:\/admin|\/api\/admin|isAdmin|adminOnly|admin.*route)/i;
    const hasAuthCheck = /auth|role|permission|middleware.*auth|isAuthenticated|protect|guard/i.test(allContent);
    if (adminRoutePattern.test(allContent) && !hasAuthCheck) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        if (adminRoutePattern.test(content)) {
          findings.push({
            ruleId: "DK-CMS-002",
            title: "Admin routes accessible without authentication or authorization checks",
            severity: "high",
            confidence: "medium",
            missingControls: ["Authentication middleware", "Role-based access control", "Permission verification"],
            consequence: "Unauthorized users can access administrative endpoints, allowing them to modify content, users, and system configuration.",
            acceptanceCriteria: [
              "All admin routes are protected by authentication middleware",
              "Authorization checks verify the user has admin role or appropriate permissions",
              "Unauthorized access attempts return 401/403 responses"
            ],
            evidence: [{
              id: "DK-CMS-002-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["Admin route or endpoint detected without accompanying auth middleware", "No authentication or role-based checks found in codebase"]
            }]
          });
        }
      }
    }
  }

  // DK-CMS-003 (medium,medium): File upload without validation - check upload/multer/formidable without mime.*check/type.*check/size.*limit/allowlist
  {
    const uploadPattern = /(?:multer|formidable|upload|fileUpload|multipart)/i;
    const hasUploadValidation = /mime.*check|type.*check|size.*limit|allowlist|allowedMime|fileFilter|limits\s*:/i.test(allContent);
    if (uploadPattern.test(allContent) && !hasUploadValidation) {
      for (const file of files) {
        const content = await readFileContent(root, file);
        if (uploadPattern.test(content)) {
          findings.push({
            ruleId: "DK-CMS-003",
            title: "File upload endpoint lacks MIME type validation, size limits, or allowlist",
            severity: "medium",
            confidence: "medium",
            missingControls: ["MIME type validation", "File size limits", "File extension allowlist", "File content inspection"],
            consequence: "Attackers can upload malicious files (web shells, executables, oversized files) to compromise the server or cause denial of service.",
            acceptanceCriteria: [
              "File uploads validate MIME type against an allowlist",
              "File size limits are enforced",
              "Uploaded files are stored outside the web root or with non-executable permissions",
              "File content is inspected, not just extension"
            ],
            evidence: [{
              id: "DK-CMS-003-1",
              detector: "pattern-match",
              location: { path: file },
              controls: [],
              signals: ["File upload mechanism detected (multer/formidable/upload)", "No MIME type validation, size limits, or allowlist found"]
            }]
          });
        }
      }
    }
  }

  return findings;
}
