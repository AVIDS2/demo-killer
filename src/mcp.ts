#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveRepository } from "./repository.js";
import { analyzeFindings } from "./rules/index.js";
import { buildJsonReport } from "./report/json.js";
import { renderMarkdownReport } from "./report/markdown.js";
import type { AnalysisReport } from "./types.js";

export async function runInspection(projectPath: string): Promise<AnalysisReport> {
  const resolved = await resolveRepository(projectPath);
  try {
    const { findings, inventory } = await analyzeFindings(resolved.root);
    const supportedStacks = [
      "nextjs", "express", "fastify", "flask", "fastapi", "django",
      "gin", "echo", "fiber", "actix", "axum", "rocket",
      "spring-boot", "ktor", "laravel", "rails", "sinatra",
      "aspnet", "vapor", "http4s", "akka",
    ];
    const hasEvidence = supportedStacks.includes(inventory.stack) && inventory.apiRoutes.length > 0;
    return buildJsonReport(findings, new Date().toISOString(), {
      hasSupportedProjectEvidence: hasEvidence,
    });
  } finally {
    await resolved.cleanup?.();
  }
}

type ToolContent = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export async function handleInspectProject(
  projectPath: string,
  format: "json" | "markdown" = "json",
): Promise<ToolContent> {
  try {
    const report = await runInspection(projectPath);
    const text =
      format === "markdown" ? renderMarkdownReport(report) : JSON.stringify(report, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

export async function handleListLaunchBlockers(projectPath: string): Promise<ToolContent> {
  try {
    const report = await runInspection(projectPath);
    const blockers = report.findings.filter((f) => f.severity === "blocker");
    const result = {
      verdict: report.verdict,
      blockerCount: blockers.length,
      blockers: blockers.map((f) => ({
        ruleId: f.ruleId,
        title: f.title,
        entryPoint: f.entryPoint,
        consequence: f.consequence,
        acceptanceCriteria: f.acceptanceCriteria,
      })),
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

export async function handleGenerateHardeningPlan(projectPath: string): Promise<ToolContent> {
  try {
    const report = await runInspection(projectPath);
    return {
      content: [{ type: "text", text: JSON.stringify(report.hardeningPlan, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "demokiller",
    version: "0.4.0",
  });

  server.tool(
    "inspect_project",
    "Run a full production-readiness inspection on a project. Returns a verdict (Launch Blocked / Demo / Production Candidate / Insufficient Evidence), all findings with severity and evidence, and a phased hardening plan. Accepts a local path or a public GitHub URL.",
    {
      path: z.string().describe("Local directory path or public GitHub URL to inspect"),
      format: z
        .enum(["json", "markdown"])
        .default("json")
        .describe("Output format: json (structured) or markdown (human-readable)"),
    },
    async ({ path, format }) => handleInspectProject(path, format),
  );

  server.tool(
    "list_launch_blockers",
    "List only the launch blockers for a project — findings with severity 'blocker' that must be fixed before any production deployment. Faster than a full inspection when you only need the go/no-go signal.",
    {
      path: z.string().describe("Local directory path or public GitHub URL to inspect"),
    },
    async ({ path }) => handleListLaunchBlockers(path),
  );

  server.tool(
    "generate_hardening_plan",
    "Generate a phased hardening plan for a project. Returns a prioritized plan with phase-0 (stop-launch blockers), phase-1 (production baseline), and phase-2 (operational confidence). Use this to guide the fix sequence after an inspection.",
    {
      path: z.string().describe("Local directory path or public GitHub URL to inspect"),
    },
    async ({ path }) => handleGenerateHardeningPlan(path),
  );

  return server;
}

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
