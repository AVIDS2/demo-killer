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

  it("detects Express projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/express-ai-saas-risky");

    expect(inventory.stack).toBe("express");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
    expect(inventory.apiRoutes).toEqual(
      expect.arrayContaining([
        "src/routes/chat.ts",
        "src/routes/admin.ts",
        "src/routes/webhook.ts",
      ]),
    );
  });

  it("detects Go Gin projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/gin-ai-saas-risky");

    expect(inventory.stack).toBe("gin");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
  });

  it("detects Rust Actix projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/actix-ai-saas-risky");

    expect(inventory.stack).toBe("actix");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
  });

  it("detects Java Spring Boot projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/springboot-ai-saas-risky");

    expect(inventory.stack).toBe("spring-boot");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
  });

  it("detects PHP Laravel projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/laravel-risky");

    expect(inventory.stack).toBe("laravel");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
  });

  it("detects Ruby Rails projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/rails-risky");

    expect(inventory.stack).toBe("rails");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
  });

  it("detects C# ASP.NET projects and their route files", async () => {
    const inventory = await buildInventory("fixtures/aspnet-risky");

    expect(inventory.stack).toBe("aspnet");
    expect(inventory.apiRoutes.length).toBeGreaterThan(0);
  });

  it("detects project metadata fields", async () => {
    const inventory = await buildInventory("fixtures/next-ai-saas-hardened");

    expect(inventory.hasDockerfile).toBe(false);
    expect(inventory.hasTypeScript).toBe(true);
    expect(inventory.tsStrictMode).toBe(true);
    expect(inventory.hasReadme).toBe(true);
    expect(inventory.hasLicense).toBe(true);
  });

  it("detects express stack even when no route files exist", async () => {
    const inventory = await buildInventory("fixtures/unsupported-empty-node");

    expect(inventory.stack).toBe("express");
    expect(inventory.apiRoutes).toEqual([]);
  });
});
