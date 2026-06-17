import { promises as fs } from "node:fs";
import path from "node:path";

export interface ProjectInventory {
  root: string;
  stack: "nextjs" | "unknown";
  apiRoutes: string[];
  envExamplePath?: string;
  prismaSchemaPath?: string;
  migrationPaths: string[];
  packageJson: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

async function walk(root: string, dir = root): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next") continue;

    if (entry.isDirectory()) {
      result.push(...(await walk(root, fullPath)));
    } else {
      result.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }

  return result;
}

export async function buildInventory(root: string): Promise<ProjectInventory> {
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const files = await walk(root);
  const dependencies = packageJson.dependencies ?? {};
  const devDependencies = packageJson.devDependencies ?? {};

  return {
    root,
    stack: dependencies.next || devDependencies.next ? "nextjs" : "unknown",
    apiRoutes: files.filter((file) => file.startsWith("app/api/") && file.endsWith("/route.ts")),
    envExamplePath: files.includes(".env.example") ? ".env.example" : undefined,
    prismaSchemaPath: files.includes("prisma/schema.prisma") ? "prisma/schema.prisma" : undefined,
    migrationPaths: files.filter(
      (file) => file.startsWith("prisma/migrations/") && file.endsWith(".sql"),
    ),
    packageJson: { dependencies, devDependencies },
  };
}
