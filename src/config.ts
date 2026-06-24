import { promises as fs } from "node:fs";
import path from "node:path";

export interface DemokillerConfig {
  exclude?: string[];
  include?: string[];
  rules?: {
    disabled?: string[];
    overrides?: Record<string, { severity?: string; confidence?: string }>;
  };
  thresholds?: {
    maxFindings?: number;
    failOn?: ("blocker" | "high" | "medium" | "advisory")[];
  };
  output?: {
    format?: "json" | "markdown";
    top?: number;
  };
}

const CONFIG_FILENAMES = [".demokillerc.json", ".demokiller.json", "demokiller.config.json"];

export async function loadConfig(root: string): Promise<DemokillerConfig> {
  for (const filename of CONFIG_FILENAMES) {
    try {
      const text = await fs.readFile(path.join(root, filename), "utf8");
      const config = JSON.parse(text) as DemokillerConfig;
      return normalizeConfig(config);
    } catch {
      // file doesn't exist or invalid JSON — try next
    }
  }
  return {};
}

function normalizeConfig(config: DemokillerConfig): DemokillerConfig {
  return {
    exclude: config.exclude ?? [],
    include: config.include ?? [],
    rules: {
      disabled: config.rules?.disabled ?? [],
      overrides: config.rules?.overrides ?? {},
    },
    thresholds: {
      maxFindings: config.thresholds?.maxFindings,
      failOn: config.thresholds?.failOn ?? ["blocker"],
    },
    output: {
      format: config.output?.format,
      top: config.output?.top,
    },
  };
}

export function applyConfig<T extends { ruleId: string; severity: string }>(
  findings: T[],
  config: DemokillerConfig,
): T[] {
  let filtered = findings;

  // Remove disabled rules
  if (config.rules?.disabled?.length) {
    const disabled = new Set(config.rules.disabled);
    filtered = filtered.filter((f) => !disabled.has(f.ruleId));
  }

  // Apply severity overrides
  if (config.rules?.overrides) {
    filtered = filtered.map((f) => {
      const override = config.rules!.overrides![f.ruleId];
      if (override?.severity) {
        return { ...f, severity: override.severity };
      }
      return f;
    });
  }

  // Apply output limit
  if (config.output?.top) {
    filtered = filtered.slice(0, config.output.top);
  }

  return filtered;
}

export function shouldFailCI(findings: Array<{ severity: string }>, config: DemokillerConfig): boolean {
  const failOn = config.thresholds?.failOn ?? ["blocker"];
  const failSet = new Set(failOn);

  if (config.thresholds?.maxFindings && findings.length >= config.thresholds.maxFindings) {
    return true;
  }

  return findings.some((f) => failSet.has(f.severity as "blocker" | "high" | "medium" | "advisory"));
}
