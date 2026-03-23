import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuthMode = "max" | "api";

export interface AuthResult {
  mode: AuthMode;
  apiKey?: string;
  model: string;
}

export interface AuthConfig {
  max: { preferred: boolean };
  api: { fallback: boolean; dailyCapUsd: number; model: string };
  secrets: { provider: string; globalSecretsFile: string; ageKeyFile: string };
}

export function getMaxCredentialPath(): string {
  return join(homedir(), ".claude.json");
}

export function isMaxAvailable(): boolean {
  const credPath = getMaxCredentialPath();
  if (!existsSync(credPath)) return false;
  const content = readFileSync(credPath, "utf-8");
  return content.trim().length > 0;
}

export function resolveAuth(config: AuthConfig): AuthResult {
  if (config.max.preferred && isMaxAvailable()) {
    return { mode: "max", model: "claude-sonnet-4-20250514" };
  }

  if (config.api.fallback) {
    try {
      const decrypted = execSync(
        `sops -d --extract '["ANTHROPIC_API_KEY"]' ${config.secrets.globalSecretsFile}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      );
      return { mode: "api", apiKey: decrypted.trim(), model: config.api.model };
    } catch {
      // Decryption failed — fall through to error
    }
  }

  throw new Error(
    "No auth available. Max credentials not found at ~/.claude.json and API fallback is disabled or decryption failed.",
  );
}
