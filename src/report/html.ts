import type { AnalysisReport, Finding } from "../types.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function severityBadge(s: string): string {
  const colors: Record<string, string> = {
    blocker: "#dc2626", high: "#ea580c", medium: "#ca8a04", advisory: "#6b7280",
  };
  return `<span style="background:${colors[s] || "#6b7280"};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${s.toUpperCase()}</span>`;
}

function verdictBanner(verdict: string): string {
  const colors: Record<string, string> = {
    "Launch Blocked": "#dc2626",
    "Demo": "#ca8a04",
    "Production Candidate": "#16a34a",
    "Insufficient Evidence": "#6b7280",
  };
  return `<div style="background:${colors[verdict] || "#6b7280"};color:#fff;padding:16px 24px;border-radius:8px;font-size:20px;font-weight:700;text-align:center;margin-bottom:24px">${verdict}</div>`;
}

export function renderHtmlReport(report: AnalysisReport): string {
  const findings = report.findings;
  const blockers = findings.filter(f => f.severity === "blocker");
  const highs = findings.filter(f => f.severity === "high");
  const mediums = findings.filter(f => f.severity === "medium");
  const advisories = findings.filter(f => f.severity === "advisory");

  const sections = [
    { title: "Phase 0 — Launch Blockers", findings: blockers, color: "#dc2626", icon: "⛔" },
    { title: "Phase 1 — Production Baseline", findings: highs, color: "#ea580c", icon: "⚠" },
    { title: "Phase 2 — Operational Confidence", findings: [...mediums, ...advisories], color: "#ca8a04", icon: "ℹ" },
  ];

  const findingRows = (fs: Finding[]) => fs.map(f => `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <strong style="font-family:monospace">${esc(f.ruleId)}</strong>
        ${severityBadge(f.severity)}
        ${f.confidence ? `<span style="font-size:11px;color:#6b7280">confidence: ${esc(f.confidence)}</span>` : ""}
      </div>
      <p style="margin:4px 0;font-weight:500">${esc(f.title || "")}</p>
      ${f.entryPoint ? `<p style="font-size:12px;color:#6b7280;font-family:monospace">📂 ${esc(f.entryPoint)}</p>` : ""}
      <p style="font-size:13px;color:#374151;margin:6px 0">${esc(f.consequence || "")}</p>
      ${(f.acceptanceCriteria || []).length > 0 ? `
        <details style="font-size:12px;color:#6b7280;margin-top:4px">
          <summary>Acceptance Criteria</summary>
          <ul style="margin:4px 0;padding-left:20px">${f.acceptanceCriteria!.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
        </details>` : ""}
    </div>
  `).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Demo Killer Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; background: #f9fafb; color: #111827; }
    .stat { text-align: center; padding: 12px 16px; border-radius: 8px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .stat-value { font-size: 28px; font-weight: 700; }
    .chart-bar { height: 24px; border-radius: 4px; transition: width 0.3s; }
  </style>
</head>
<body>
  <h1 style="font-size:24px;margin-bottom:4px">Demo Killer Report</h1>
  <p style="color:#6b7280;margin-top:0">${esc(report.generatedAt || "")}</p>
  ${verdictBanner(report.verdict)}

  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
    <div class="stat"><div class="stat-value" style="color:#111827">${findings.length}</div><div style="font-size:12px;color:#6b7280">Total</div></div>
    <div class="stat"><div class="stat-value" style="color:#dc2626">${blockers.length}</div><div style="font-size:12px;color:#6b7280">Blockers</div></div>
    <div class="stat"><div class="stat-value" style="color:#ea580c">${highs.length}</div><div style="font-size:12px;color:#6b7280">High</div></div>
    <div class="stat"><div class="stat-value" style="color:#ca8a04">${mediums.length}</div><div style="font-size:12px;color:#6b7280">Medium</div></div>
    <div class="stat"><div class="stat-value" style="color:#6b7280">${advisories.length}</div><div style="font-size:12px;color:#6b7280">Advisory</div></div>
  </div>

  ${findings.length > 0 ? `<div style="background:#fff;border-radius:6px;padding:4px;margin-bottom:16px">
    <div style="display:flex;height:24px;border-radius:4px;overflow:hidden">
      ${blockers.length > 0 ? `<div class="chart-bar" style="width:${blockers.length/findings.length*100}%;background:#dc2626" title="Blockers: ${blockers.length}"></div>` : ""}
      ${highs.length > 0 ? `<div class="chart-bar" style="width:${highs.length/findings.length*100}%;background:#ea580c" title="High: ${highs.length}"></div>` : ""}
      ${mediums.length > 0 ? `<div class="chart-bar" style="width:${mediums.length/findings.length*100}%;background:#ca8a04" title="Medium: ${mediums.length}"></div>` : ""}
      ${advisories.length > 0 ? `<div class="chart-bar" style="width:${advisories.length/findings.length*100}%;background:#6b7280" title="Advisory: ${advisories.length}"></div>` : ""}
    </div>
  </div>` : `<p style="text-align:center;color:#16a34a;font-size:18px;padding:32px">No findings in supported scope</p>`}

  ${sections.filter(s => s.findings.length > 0).map(s => `
    <h2 style="color:${s.color};margin-top:24px">${s.icon} ${s.title} (${s.findings.length})</h2>
    ${findingRows(s.findings)}
  `).join("\n")}

  <hr style="margin:32px 0;border-color:#e5e7eb">
  <p style="font-size:11px;color:#9ca3af;text-align:center">
    Supported scope: ${report.supportedScope.slice(0, 8).join(", ")}${report.supportedScope.length > 8 ? "..." : ""}<br>
    Demo Killer v0.5.2 — Production Readiness Gate
  </p>
</body>
</html>`;
}
