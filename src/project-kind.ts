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

  // Domain-specific deps (check BEFORE web frameworks — stripe+express = payment-system, not web-app)
  if (depNames.some(d => d === "stripe" || d === "paypal-rest-sdk" || d === "squareup")) return "payment-system";
  if (depNames.some(d => d === "passport" || d === "@auth/core" || d === "next-auth" || d === "keycloak-js" || d === "@clerk/nextjs")) return "auth-service";
  if (depNames.some(d => d === "ethers" || d === "web3" || d === "@solana/web3.js" || d === "hardhat")) return "blockchain";
  // Desktop
  if (depNames.some(d => d === "electron" || d === "@tauri-apps/cli" || d === "tauri")) return "desktop-app";
  // Mobile
  if (depNames.some(d => d === "react-native" || d === "flutter" || d === "@capacitor/core")) return "mobile-app";
  // Game engines
  if (depNames.some(d => d === "phaser" || d === "pixi.js" || d === "three")) return "game";
  // ML/Data
  if (depNames.some(d => d === "tensorflow" || d === "torch" || d === "pandas" || d === "apache-airflow" || d === "pyspark")) return "ml-pipeline";
  // IaC (check before testing frameworks which may pull in cdk)
  if (depNames.some(d => d.includes("cdktf") || d.includes("pulumi") || d.includes("terraform"))) return "iac";
  // File-based IaC detection (pure .tf files without npm packages)
  if (fileStr.includes(".tf") || fileStr.includes(".tfvars") || fileStr.includes("cloudformation") || fileStr.includes("pulumi")) return "iac";
  // Message queues
  if (depNames.some(d => d === "kafkajs" || d === "amqplib" || d === "bullmq" || d === "bull")) return "mq-worker";
  // Cron
  if (depNames.some(d => d === "node-cron" || d === "node-schedule" || d === "celery")) return "cron-job";
  // Serverless
  if (depNames.some(d => d.includes("serverless") || d === "@aws-lambda" || d.startsWith("@aws-sdk"))) return "serverless-func";
  // File-based serverless detection
  if (fileStr.includes("serverless.yml") || fileStr.includes("template.yaml") || fileStr.includes("samconfig.toml")) return "serverless-func";
  // Web frameworks (generic — after domain-specific to avoid stripe+express → web-app)
  if (depNames.some(d => d === "next" || d === "@nestjs/core" || d === "react" || d === "vue" || d === "svelte" || d === "angular" || d === "express" || d === "fastify" || d === "flask" || d === "django" || d === "gin" || d === "actix-web")) return "web-app";
  // Static site generators
  if (depNames.some(d => d === "astro" || d === "gatsby" || d === "hugo" || d === "next" && depNames.some(x => x === "sharp" || x === "rehype"))) return "static-site";
  // Browser extensions
  if (depNames.some(d => d === "webextension-polyfill" || d === "@types/chrome")) return "browser-extension";
  // CLI frameworks (must be before testing which may pull in commander)
  if (depNames.some(d => d === "commander" || d === "yargs" || d === "cac" || d === "clipanion" || d === "oclif" || d === "@oclif/core")) return "cli-tool";
  // AI SDKs → check for CLI entry before classifying as cli-tool
  if (depNames.some(d => d === "@anthropic-ai/sdk" || d === "openai" || d === "@modelcontextprotocol/sdk")) {
    if (fileStr.includes("bin/") || fileStr.includes("src/cli") || fileStr.includes("command")) return "cli-tool";
  }

  // File-based detection
  if (fileStr.includes("bin/") || fileStr.includes("src/cli") || fileStr.includes("command")) return "cli-tool";
  if (depNames.length > 0 && !fileStr.includes("route") && !fileStr.includes("api/")) return "library-sdk";

  return "unknown";
}
