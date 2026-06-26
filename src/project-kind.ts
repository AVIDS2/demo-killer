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

  // Web frameworks (most specific first)
  if (depNames.some(d => d === "next" || d === "@nestjs/core" || d === "react" || d === "vue" || d === "svelte" || d === "angular" || d === "express" || d === "fastify" || d === "flask" || d === "django" || d === "gin" || d === "actix-web")) return "web-app";
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
  // Message queues
  if (depNames.some(d => d === "kafkajs" || d === "amqplib" || d === "bullmq" || d === "bull")) return "mq-worker";
  // Cron
  if (depNames.some(d => d === "node-cron" || d === "node-schedule" || d === "celery")) return "cron-job";
  // Blockchain
  if (depNames.some(d => d === "ethers" || d === "web3" || d === "@solana/web3.js" || d === "hardhat")) return "blockchain";
  // Payment
  if (depNames.some(d => d === "stripe" || d === "paypal-rest-sdk" || d === "squareup")) return "payment-system";
  // Auth
  if (depNames.some(d => d === "passport" || d === "@auth/core" || d === "next-auth" || d === "keycloak-js" || d === "@clerk/nextjs")) return "auth-service";
  // Serverless
  if (depNames.some(d => d.includes("serverless") || d === "@aws-lambda")) return "serverless-func";
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
