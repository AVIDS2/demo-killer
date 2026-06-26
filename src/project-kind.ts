// Project type detection

export type ProjectKind =
  | "web-app" | "cli-tool" | "library-sdk" | "desktop-app" | "mobile-app"
  | "game" | "ml-pipeline" | "iac" | "browser-extension" | "ide-plugin"
  | "cicd-pipeline" | "migration-tool" | "mq-worker" | "api-gateway"
  | "cron-job" | "wasm-module" | "blockchain" | "iot-embedded"
  | "devops-script" | "serverless-func" | "static-site" | "cms"
  | "monitoring-tool" | "auth-service" | "payment-system"
  | "unknown";

export function detectProjectKind(deps: Record<string, string>, files: string[]): ProjectKind {
  const depNames = Object.keys(deps);
  const fileStr = files.join(" ").toLowerCase();

  if (depNames.some(d => d === "next" || d === "@nestjs/core" || d === "react" || d === "vue" || d === "svelte" || d === "angular" || d === "express" || d === "fastify" || d === "flask" || d === "django" || d === "gin" || d === "actix-web")) return "web-app";
  if (depNames.some(d => d === "electron" || d === "@tauri-apps/cli" || d === "tauri")) return "desktop-app";
  if (depNames.some(d => d === "react-native" || d === "flutter" || d === "@capacitor/core")) return "mobile-app";
  if (depNames.some(d => d === "phaser" || d === "pixi.js")) return "game";
  if (depNames.some(d => d === "tensorflow" || d === "torch" || d === "pandas" || d === "apache-airflow" || d === "pyspark")) return "ml-pipeline";
  if (depNames.some(d => d.includes("cdktf") || d.includes("pulumi"))) return "iac";
  if (depNames.some(d => d === "playwright" || d === "cypress" || d === "puppeteer")) return "cicd-pipeline";
  if (depNames.some(d => d === "kafkajs" || d === "amqplib" || d === "bullmq" || d === "bull")) return "mq-worker";
  if (depNames.some(d => d === "node-cron" || d === "node-schedule" || d === "celery")) return "cron-job";
  if (depNames.some(d => d === "ethers" || d === "web3" || d === "@solana/web3.js" || d === "hardhat")) return "blockchain";
  if (depNames.some(d => d.includes("serverless") || d === "@aws-lambda")) return "serverless-func";
  if (depNames.some(d => d === "astro" || d === "gatsby" || d === "hugo")) return "static-site";
  if (depNames.some(d => d === "stripe")) return "payment-system";
  if (depNames.some(d => d === "prisma" || d === "typeorm" || d === "knex" || d === "alembic")) return "migration-tool";
  if (depNames.some(d => d.includes("terraform"))) return "iac";
  if (depNames.some(d => d === "@anthropic-ai/sdk" || d === "openai" || d === "@modelcontextprotocol/sdk")) return "cli-tool";
  if (depNames.some(d => d === "commander" || d === "yargs" || d === "cac" || d === "clipanion" || d === "oclif")) return "cli-tool";

  // File-based detection
  if (fileStr.includes("bin/") || fileStr.includes("src/cli")) return "cli-tool";
  if (depNames.length > 0 && !fileStr.includes("route") && !fileStr.includes("api/")) return "library-sdk";

  return "unknown";
}
