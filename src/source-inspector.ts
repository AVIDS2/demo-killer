import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";

export interface RouteSourceEvidence {
  path: string;
  capabilities: string[];
  controls: string[];
  envVars: string[];
  line: number;
}

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

export async function inspectRouteSource(
  root: string,
  relativePath: string,
): Promise<RouteSourceEvidence> {
  const project = new Project({ useInMemoryFileSystem: false });
  const sourceFile = project.addSourceFileAtPath(path.join(root, relativePath));
  const text = sourceFile.getFullText();
  const firstFunction = sourceFile.getFunctions()[0];
  const line = firstFunction?.getStartLineNumber() ?? 1;

  const capabilities: string[] = [];
  const controls: string[] = [];
  const envVars = Array.from(text.matchAll(/process\.env\.([A-Z0-9_]+)/g)).map(
    (match) => match[1],
  );

  if (text.includes("openai") || text.includes("OpenAI") || text.includes("chat.completions")) {
    pushUnique(capabilities, "callsOpenAI");
  }
  if (text.includes("stripe") || text.includes("Stripe")) {
    pushUnique(capabilities, "handlesPaymentProvider");
  }
  if (text.includes("prisma.") && text.match(/\.(delete|update|create|upsert)\s*\(/)) {
    pushUnique(capabilities, "mutatesDatabase");
  }
  if (text.match(/\bauth\s*\(/) || text.includes("getServerSession") || text.includes("currentUser")) {
    pushUnique(controls, "auth");
  }
  if (text.includes("role") || text.includes("isAdmin") || text.includes("permission")) {
    pushUnique(controls, "authorization");
  }
  if (text.includes("rateLimit") || text.includes("limiter")) {
    pushUnique(controls, "rateLimit");
  }
  if (text.includes("constructEvent") || text.includes("STRIPE_WEBHOOK_SECRET")) {
    pushUnique(controls, "signatureVerification");
  }
  if (text.includes("idempotency") || text.includes("event.id")) {
    pushUnique(controls, "idempotency");
  }
  if (
    sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getText().startsWith("console."))
  ) {
    pushUnique(controls, "logging");
  }

  return { path: relativePath, capabilities, controls, envVars, line };
}
