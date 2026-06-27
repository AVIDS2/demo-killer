import type { Finding } from "../types.js";
import type { ProjectInventory } from "../inventory.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PythonCallGraph, PythonCallSite, PythonFuncDef } from "../python-call-graph.js";

async function readFileContent(root: string, file: string): Promise<string> {
  try { return await fs.readFile(path.join(root, file), "utf8"); } catch { return ""; }
}

async function walkSourceFiles(root: string, exts: string[]): Promise<string[]> {
  const SKIP = new Set(["node_modules", "dist", "build", ".git", "__pycache__", "target", "vendor", ".venv", "venv"]);
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

export async function pythonFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  const pyFiles = await walkSourceFiles(root, [".py"]);
  if (pyFiles.length === 0) return [];

  const allContent = (await Promise.all(pyFiles.map(f => readFileContent(root, f)))).join("\n");

  // DK-PY-001: SQL injection via f-string/format in query execution
  const hasSQLInjection =
    /(?:execute|executemany|raw)\s*\(\s*f["']/.test(allContent) ||
    /(?:execute|executemany|raw)\s*\(\s*["'].*\.format\s*\(/.test(allContent) ||
    /(?:execute|executemany|raw)\s*\(\s*["'].*%\s/.test(allContent) ||
    /(?:execute|executemany|raw)\s*\(\s*["'].*\+\s*\w/.test(allContent);

  const hasParameterized =
    /\?\s*,/.test(allContent) ||
    /:\w+/.test(allContent) ||
    /\$\d+/.test(allContent) ||
    /sqlalchemy/i.test(allContent) ||
    /\.objects\.filter\(/.test(allContent) ||
    /\.query\.filter\(/.test(allContent);

  if (hasSQLInjection && !hasParameterized) {
    findings.push({
      ruleId: "DK-PY-001",
      title: "SQL injection via string interpolation in query execution",
      severity: "blocker",
      confidence: "high",
      missingControls: ["parameterizedQueries"],
      consequence: "SQL queries constructed with f-strings, format(), or string concatenation allow attackers to inject arbitrary SQL. This can lead to data exfiltration, modification, or deletion.",
      acceptanceCriteria: [
        "Use parameterized queries (%s, :param, ?) for all SQL statements.",
        "Use an ORM (SQLAlchemy, Django ORM) for database access.",
        "Never interpolate user input into SQL strings.",
      ],
      evidence: [{ id: "py-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["SQL query with string interpolation"] }],
    });
  }

  // DK-PY-002: Command injection via subprocess/os.system
  const hasCommandInjection =
    /os\.system\s*\(\s*(?:f["']|["'].*\.format|\w+\s*\+|\w+%)/.test(allContent) ||
    /subprocess\.(?:call|run|Popen|check_output|check_call)\s*\(\s*(?:f["']|["'].*\.format)/.test(allContent) ||
    /subprocess\.(?:call|run|Popen|check_output|check_call)\s*\(\s*["'].*\+/.test(allContent) ||
    /os\.popen\s*\(/.test(allContent);

  const hasShellSafety =
    /shlex\.quote/.test(allContent) ||
    /subprocess\.\w+\s*\(\s*\[/.test(allContent) ||
    /shell\s*=\s*False/.test(allContent);

  if (hasCommandInjection && !hasShellSafety) {
    findings.push({
      ruleId: "DK-PY-002",
      title: "Command injection via string interpolation in subprocess call",
      severity: "blocker",
      confidence: "high",
      missingControls: ["commandInjectionPrevention"],
      consequence: "Passing user-controlled input to os.system(), subprocess with shell=True, or os.popen() allows arbitrary command execution on the server.",
      acceptanceCriteria: [
        "Use subprocess with a list of arguments, not a single shell string.",
        "Sanitize user input with shlex.quote() before passing to shell commands.",
        "Avoid os.system() and os.popen() entirely.",
      ],
      evidence: [{ id: "py-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["subprocess with string interpolation"] }],
    });
  }

  // DK-PY-003: Unsafe deserialization
  const hasUnsafeDeserialization =
    /pickle\.loads?\s*\(/.test(allContent) ||
    /yaml\.load\s*\(\s*(?!.*Loader\s*=)/.test(allContent) ||
    /(?:^|\s)eval\s*\(/.test(allContent) ||
    /(?:^|\s)exec\s*\(/.test(allContent) ||
    /marshal\.loads?\s*\(/.test(allContent) ||
    /shelve\.open\s*\(/.test(allContent);

  const hasSafeDeserialization =
    /yaml\.safe_load/.test(allContent) ||
    /json\.loads?\s*\(/.test(allContent) ||
    /SafeLoader/.test(allContent);

  if (hasUnsafeDeserialization && !hasSafeDeserialization) {
    findings.push({
      ruleId: "DK-PY-003",
      title: "Unsafe deserialization detected (pickle/yaml.load/eval/exec)",
      severity: "blocker",
      confidence: "high",
      missingControls: ["safeDeserialization"],
      consequence: "pickle.loads(), yaml.load() without SafeLoader, eval(), and exec() can execute arbitrary code from untrusted input. This is a direct remote code execution vector.",
      acceptanceCriteria: [
        "Use yaml.safe_load() or yaml.load(..., Loader=SafeLoader) instead of yaml.load().",
        "Replace pickle with json for data exchange. If pickle is required, restrict to trusted sources.",
        "Never use eval() or exec() on user-controlled input.",
      ],
      evidence: [{ id: "py-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["unsafe deserialization pattern"] }],
    });
  }

  // DK-PY-004: Path traversal via file operations with user input
  const hasPathTraversal =
    /open\s*\(\s*(?:request\.|args|params|input|user)/.test(allContent) ||
    /open\s*\(\s*f["']/.test(allContent) ||
    /Path\s*\(\s*(?:request\.|args|params)/.test(allContent) ||
    /os\.path\.join\s*\(\s*(?:request\.|args|params)/.test(allContent);

  const hasPathSanitization =
    /os\.path\.realpath/.test(allContent) ||
    /(?:\.resolve\(\)|\.absolute\(\))/.test(allContent) ||
    /secure_filename/.test(allContent) ||
    /pathlib.*resolve/.test(allContent);

  if (hasPathTraversal && !hasPathSanitization) {
    findings.push({
      ruleId: "DK-PY-004",
      title: "Path traversal via unsanitized user input in file operations",
      severity: "blocker",
      confidence: "medium",
      missingControls: ["pathTraversalPrevention"],
      consequence: "Passing user-controlled input directly to open(), Path(), or os.path.join() allows attackers to read or write arbitrary files on the server using path traversal sequences (../).",
      acceptanceCriteria: [
        "Validate file paths against an allowed directory using os.path.realpath().",
        "Use werkzeug.utils.secure_filename() for uploaded filenames.",
        "Reject paths containing '..' or absolute paths outside the allowed directory.",
      ],
      evidence: [{ id: "py-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["file operation with user input"] }],
    });
  }

  // DK-PY-005: Missing authentication on web framework routes
  const hasRoutes =
    /@(?:app|router|blueprint)\.(?:get|post|put|delete|patch)\s*\(/.test(allContent) ||
    /def\s+(?:get|post|put|delete|patch)\s*\(\s*self\s*(?:,\s*request)?/.test(allContent);

  const hasAuth =
    /Depends\s*\(\s*(?:get_current_user|get_user|verify_token|require_auth)/.test(allContent) ||
    /@login_required/.test(allContent) ||
    /@jwt_required/.test(allContent) ||
    /@auth\.requires/.test(allContent) ||
    /AuthenticationMiddleware/.test(allContent) ||
    /permission_classes/.test(allContent);

  if (hasRoutes && !hasAuth) {
    findings.push({
      ruleId: "DK-PY-005",
      title: "Web framework routes without authentication middleware",
      severity: "high",
      confidence: "medium",
      missingControls: ["routeAuthentication"],
      consequence: "API routes without authentication are accessible to anyone. This can expose sensitive data, allow unauthorized mutations, or enable abuse of the API.",
      acceptanceCriteria: [
        "All non-public routes require authentication via dependency injection or middleware.",
        "Use FastAPI Depends(get_current_user), Django @login_required, or Flask @jwt_required.",
        "Public routes are explicitly marked as such.",
      ],
      evidence: [{ id: "py-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["routes without auth middleware"] }],
    });
  }

  // DK-PY-006: SSRF via requests/httpx with user-controlled URL
  const hasSSRF =
    /requests\.(?:get|post|put|delete|patch|head|options)\s*\(\s*(?:request\.|args|params|url|input)/.test(allContent) ||
    /httpx\.(?:get|post|put|delete|patch|head|options)\s*\(\s*(?:request\.|args|params|url|input)/.test(allContent) ||
    /requests\.(?:get|post)\s*\(\s*f["']/.test(allContent) ||
    /urllib\.request\.urlopen\s*\(\s*(?:request\.|args)/.test(allContent);

  const hasURLValidation =
    /urlparse.*(?:hostname|netloc)/.test(allContent) ||
    /(?:allowlist|whitelist|allowed_hosts|ALLOWED_DOMAINS)/i.test(allContent) ||
    /ipaddress\.(?:ip_address|ip_network)/.test(allContent) ||
    /\bnosrf\b|no[_-]?ssrf/i.test(allContent);

  if (hasSSRF && !hasURLValidation) {
    findings.push({
      ruleId: "DK-PY-006",
      title: "SSRF via HTTP client with user-controlled URL",
      severity: "blocker",
      confidence: "medium",
      missingControls: ["ssrfPrevention"],
      consequence: "Passing user-controlled URLs to requests/httpx/urllib allows Server-Side Request Forgery (SSRF). Attackers can access internal services, cloud metadata endpoints (169.254.169.254), or scan internal networks.",
      acceptanceCriteria: [
        "Validate URLs against an allowlist of permitted domains/schemes.",
        "Block requests to private IP ranges and metadata endpoints.",
        "Use a URL parsing library to extract and validate the hostname.",
      ],
      evidence: [{ id: "py-scan", detector: "project-scan", location: { path: "." }, controls: [], signals: ["HTTP client with user-controlled URL"] }],
    });
  }

  // DK-PY-007: Cross-function taint path analysis via call graph
  try {
    const { buildPythonCallGraph } = await import("../python-call-graph.js");
    const callGraph: PythonCallGraph = await buildPythonCallGraph(root);

    // Dangerous sinks that should not receive tainted input without sanitization
    const DANGEROUS_SINKS = new Set([
      "execute", "executemany", "raw",
      "eval", "exec", "os.system", "os.popen",
      "subprocess.call", "subprocess.run", "subprocess.Popen",
      "subprocess.check_output", "subprocess.check_call",
      "pickle.loads", "pickle.load", "yaml.load",
      "marshal.loads", "marshal.load", "shelve.open",
      "requests.get", "requests.post", "requests.put",
      "requests.delete", "requests.patch",
      "httpx.get", "httpx.post", "httpx.put",
      "httpx.delete", "httpx.patch",
      "urllib.request.urlopen",
      "open", "Path",
    ]);

    // Sanitization functions that neutralize tainted data
    const SANITIZERS = new Set([
      "shlex.quote", "escape", "sanitize", "safe_load", "safe_dump",
      "parameterize", "validate", "secure_filename", "realpath",
      "quote_plus", "url_quote", "bleach.clean", "markupsafe.escape",
      "html.escape", "json.dumps", "json.loads",
    ]);

    // Identify route handler functions (entry points for user input)
    const routeHandlers = new Set<string>();
    for (const route of callGraph.routes) {
      const qualified = `${route.file}:${route.handler}`;
      routeHandlers.add(qualified);
    }

    // Also consider functions with request parameters as potential entry points
    for (const [qualified, func] of callGraph.functions) {
      const rawLower = func.rawParams.toLowerCase();
      if (rawLower.includes("request") || rawLower.includes("form") ||
          rawLower.includes("query") || rawLower.includes("body")) {
        routeHandlers.add(qualified);
      }
    }

    // Build a call adjacency map: caller -> [callee]
    const callAdjacency = new Map<string, PythonCallSite[]>();
    for (const call of callGraph.calls) {
      const existing = callAdjacency.get(call.caller) ?? [];
      existing.push(call);
      callAdjacency.set(call.caller, existing);
    }

    // Trace taint from route handlers to dangerous sinks via BFS
    const visited = new Set<string>();
    const taintFindings: { entry: string; sink: string; path: string[] }[] = [];

    for (const entry of routeHandlers) {
      const queue: { func: string; path: string[] }[] = [{ func: entry, path: [entry] }];
      visited.clear();

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.func)) continue;
        visited.add(current.func);

        const calls = callAdjacency.get(current.func) ?? [];
        for (const call of calls) {
          const calleeName = call.callee;

          // Check if callee is a dangerous sink
          const isSink = DANGEROUS_SINKS.has(calleeName) ||
            // Also match dotted variants (e.g., "cursor.execute" for "execute")
            Array.from(DANGEROUS_SINKS).some(sink => calleeName.endsWith(`.${sink}`));

          if (isSink) {
            // Check if any function in the taint path uses a sanitizer
            const pathUsesSanitizer = current.path.some(p => {
              const funcCalls = callAdjacency.get(p) ?? [];
              return funcCalls.some(fc =>
                SANITIZERS.has(fc.callee) ||
                Array.from(SANITIZERS).some(s => fc.callee.endsWith(`.${s}`))
              );
            });

            if (!pathUsesSanitizer) {
              taintFindings.push({
                entry,
                sink: calleeName,
                path: [...current.path, `${call.file}:${call.line}`],
              });
            }
          }

          // Resolve callee to a function in the call graph for traversal
          // Try exact match, then file-local match
          let nextFunc: string | undefined;
          if (callGraph.functions.has(calleeName)) {
            nextFunc = calleeName;
          } else {
            // Search by function name within the same file
            const filePrefix = `${call.file}:`;
            for (const [q] of callGraph.functions) {
              if (q.startsWith(filePrefix) && q.endsWith(`:${calleeName}`)) {
                nextFunc = q;
                break;
              }
            }
            // Also check simple name match across files
            if (!nextFunc) {
              for (const [q] of callGraph.functions) {
                if (q.endsWith(`:${calleeName}`)) {
                  nextFunc = q;
                  break;
                }
              }
            }
          }

          if (nextFunc && !visited.has(nextFunc)) {
            queue.push({ func: nextFunc, path: [...current.path, nextFunc] });
          }
        }
      }
    }

    // Deduplicate by sink
    const seenSinks = new Set<string>();
    for (const tf of taintFindings) {
      const key = `${tf.entry}->${tf.sink}`;
      if (seenSinks.has(key)) continue;
      seenSinks.add(key);

      findings.push({
        ruleId: "DK-PY-007",
        title: `Cross-function taint path: route handler → ${tf.sink} without sanitization`,
        severity: "blocker",
        confidence: "high",
        missingControls: ["crossFunctionTaintSanitization"],
        consequence: `User input from route handler "${tf.entry}" flows through function calls to dangerous sink "${tf.sink}" without passing through a sanitization function. This enables multi-step injection attacks where tainted data crosses function boundaries.`,
        acceptanceCriteria: [
          "Sanitize all user input before it reaches dangerous functions (execute, eval, os.system, etc.).",
          "Use a centralized input validation/sanitization layer at the route handler boundary.",
          "Prefer parameterized queries over string interpolation for database operations.",
          "Use subprocess with argument lists instead of shell strings.",
        ],
        evidence: [{
          id: "py-call-graph",
          detector: "python-call-graph",
          location: { path: tf.path[0]?.split(":")[0] ?? "." },
          controls: [],
          signals: [
            `Taint path: ${tf.path.join(" → ")}`,
            `Entry: ${tf.entry}`,
            `Sink: ${tf.sink}`,
          ],
        }],
      });
    }
  } catch {
    // tree-sitter not available or buildPythonCallGraph failed;
    // text-based rules (DK-PY-001 through DK-PY-006) still apply
  }

  return findings;
}
