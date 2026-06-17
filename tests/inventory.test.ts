import { describe, expect, it } from "vitest";
import { buildInventory } from "../src/inventory.js";

describe("buildInventory", () => {
  it("detects Next.js, API routes, env example, prisma schema, and migrations", async () => {
    const inventory = await buildInventory("fixtures/next-ai-saas-risky");

    expect(inventory.stack).toBe("nextjs");
    expect(inventory.apiRoutes).toEqual(
      expect.arrayContaining([
        "app/api/chat/route.ts",
        "app/api/admin/users/route.ts",
        "app/api/stripe/webhook/route.ts",
      ]),
    );
    expect(inventory.envExamplePath).toBe(".env.example");
    expect(inventory.prismaSchemaPath).toBe("prisma/schema.prisma");
    expect(inventory.migrationPaths).toEqual([]);
  });

  it("detects migrations in the partial-fix fixture", async () => {
    const inventory = await buildInventory("fixtures/next-ai-saas-partial-fix");

    expect(inventory.migrationPaths).toEqual([
      "prisma/migrations/20260101000000_init/migration.sql",
    ]);
  });
});
