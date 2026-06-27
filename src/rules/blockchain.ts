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

export async function blockchainFindings(root: string, inventory: ProjectInventory): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (inventory.projectKind !== "blockchain") return [];
  const files = await walkSourceFiles(root, [".ts",".tsx",".js",".jsx",".sol"]);
  if (files.length === 0) return [];
  const allContent = (await Promise.all(files.map(f => readFileContent(root, f)))).join("\n");

  // RULE IMPLEMENTATIONS:

  // DK-CHAIN-001 (blocker,high): Reentrancy - check external call (.call/.send/.transfer) BEFORE state update
  for (const file of files) {
    const content = await readFileContent(root, file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for external call patterns
      const hasExternalCall = /\.call\{|\.call\(|\.send\(|\.transfer\(/.test(line);
      if (!hasExternalCall) continue;
      // Check if state update happens AFTER the external call (reentrancy pattern)
      let stateUpdateAfterCall = false;
      let stateUpdateLine = -1;
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (/\[.*\]\s*[-+]?=|balances\[|state\[|mapping/.test(lines[j])) {
          stateUpdateAfterCall = true;
          stateUpdateLine = j;
          break;
        }
      }
      if (stateUpdateAfterCall) {
        findings.push({
          ruleId: "DK-CHAIN-001",
          title: "Reentrancy vulnerability: external call before state update",
          severity: "blocker",
          confidence: "medium",
          missingControls: [
            "ReentrancyGuard modifier",
            "Checks-Effects-Interactions pattern"
          ],
          consequence: "An attacker can re-enter the function during the external call and drain funds before the balance is updated.",
          acceptanceCriteria: [
            "Move all state updates before external calls (Checks-Effects-Interactions pattern)",
            "Add a ReentrancyGuard modifier from OpenZeppelin or equivalent"
          ],
          evidence: [{
            id: "reentrancy-external-call-before-state",
            detector: "DK-CHAIN-001",
            location: { path: file },
            controls: [],
            signals: [
              `Line ${i + 1}: external call via .call{value} / .send / .transfer`,
              `Line ${stateUpdateLine + 1}: state update (balance/mapping write) occurs after the external call`
            ]
          }]
        });
      }
    }
  }

  // DK-CHAIN-002 (high,medium): Integer overflow - arithmetic without SafeMath for Solidity <0.8
  for (const file of files) {
    if (!file.endsWith(".sol")) continue;
    const content = await readFileContent(root, file);
    const pragmaMatch = content.match(/pragma\s+solidity\s+\^?(\d+\.\d+)/);
    if (!pragmaMatch) continue;
    const version = parseFloat(pragmaMatch[1]);
    if (version >= 0.8) continue; // Solidity 0.8+ has built-in overflow checks
    const hasSafeMath = /SafeMath|using\s+SafeMath/.test(content);
    const hasArithmetic = /[^=!<>][+\-*][^>+*]|[^=!<>][+\-*]=/.test(content);
    if (hasArithmetic && !hasSafeMath) {
      findings.push({
        ruleId: "DK-CHAIN-002",
        title: "Integer overflow risk: arithmetic without SafeMath",
        severity: "high",
        confidence: "medium",
        missingControls: [
          "SafeMath library",
          "Checked arithmetic"
        ],
        consequence: "Arithmetic operations can silently overflow or underflow, leading to incorrect balances or token amounts.",
        acceptanceCriteria: [
          "Use SafeMath library for all arithmetic in Solidity <0.8",
          "Upgrade to Solidity 0.8+ which has built-in overflow checks"
        ],
        evidence: [{
          id: "integer-overflow-no-safemath",
          detector: "DK-CHAIN-002",
          location: { path: file },
          controls: [],
          signals: [
            `Solidity version ${version} (pre-0.8, no built-in overflow protection)`,
            "Arithmetic operators found without SafeMath usage"
          ]
        }]
      });
    }
  }

  // DK-CHAIN-003 (high,medium): Unchecked return value - .call/.send without require(success) or if(!success)
  for (const file of files) {
    const content = await readFileContent(root, file);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match low-level call or send without return check
      const isCall = /\.call\{|\.call\(/.test(line) || /\.send\(/.test(line);
      if (!isCall) continue;
      // Check if the return value is destructured into (bool success, ...)
      const hasReturnCapture = /\(\s*bool\s+\w+\s*,/.test(line) || /bool\s+\w+\s*=/.test(line);
      if (!hasReturnCapture) {
        findings.push({
          ruleId: "DK-CHAIN-003",
          title: "Unchecked return value from low-level call/send",
          severity: "high",
          confidence: "medium",
          missingControls: [
            "Return value check via require(success)",
            "Return value check via if(!success)"
          ],
          consequence: "A failed call/send will not revert the transaction, causing silent failures and potential loss of funds.",
          acceptanceCriteria: [
            "Capture the return value: (bool success, ...) = ...call{value}(...);",
            "Check the return value with require(success) or if(!success) revert"
          ],
          evidence: [{
            id: "unchecked-call-return",
            detector: "DK-CHAIN-003",
            location: { path: file },
            controls: [],
            signals: [
              `Line ${i + 1}: .call or .send invoked without capturing or checking return value`
            ]
          }]
        });
      }
    }
  }

  // DK-CHAIN-004 (medium,medium): Missing access control - public/external function modifying state without onlyOwner/require(msg.sender)/modifier
  for (const file of files) {
    if (!file.endsWith(".sol")) continue;
    const content = await readFileContent(root, file);
    const funcRegex = /function\s+\w+\s*\([^)]*\)\s+(?:public|external)\s+(?!.*\b(onlyOwner|onlyAdmin|onlyRole|onlyMinter|onlyGovernance)\b)/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const funcStart = match.index;
      // Find the function body
      const braceIndex = content.indexOf("{", funcStart);
      if (braceIndex === -1) continue;
      let depth = 1;
      let bodyEnd = braceIndex + 1;
      while (bodyEnd < content.length && depth > 0) {
        if (content[bodyEnd] === "{") depth++;
        if (content[bodyEnd] === "}") depth--;
        bodyEnd++;
      }
      const body = content.slice(braceIndex, bodyEnd);
      // Check if function modifies state (assignment to storage)
      const modifiesState = /\w+\s*[-+]?=\s*[^=]/.test(body) && !/view|pure/.test(match[0]);
      if (!modifiesState) continue;
      // Check if function has access control
      const hasAccessControl =
        /require\s*\(\s*msg\.sender\s*==/.test(body) ||
        /require\s*\(\s*isOwner|isAuthorized|hasRole/.test(body) ||
        /onlyOwner|onlyAdmin|onlyRole|onlyMinter|onlyGovernance/.test(match[0]);
      if (!hasAccessControl) {
        const funcNameMatch = match[0].match(/function\s+(\w+)/);
        const funcName = funcNameMatch ? funcNameMatch[1] : "unknown";
        findings.push({
          ruleId: "DK-CHAIN-004",
          title: `Missing access control on state-modifying function: ${funcName}`,
          severity: "medium",
          confidence: "medium",
          missingControls: [
            "Access control modifier (onlyOwner/onlyRole)",
            "require(msg.sender == owner) check"
          ],
          consequence: "Any address can call this function and modify contract state, potentially leading to unauthorized fund transfers or state corruption.",
          acceptanceCriteria: [
            "Add an access control modifier (e.g., onlyOwner, onlyRole) to the function",
            "Add a require(msg.sender == owner) or equivalent check at the start of the function"
          ],
          evidence: [{
            id: "missing-access-control",
            detector: "DK-CHAIN-004",
            location: { path: file },
            controls: [],
            signals: [
              `Function '${funcName}' is public/external and modifies state without access control`
            ]
          }]
        });
      }
    }
  }

  return findings;
}
