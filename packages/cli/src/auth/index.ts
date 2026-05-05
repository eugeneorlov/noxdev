import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuthMode = "max" | "api" | "gemini";

export interface AuthResult {
  mode: AuthMode;
  apiKey?: string;
  model: string;
}

export interface AuthConfig {
  max: { preferred: boolean };
  api: { fallback: boolean; dailyCapUsd: number; model: string; key?: string };
  gemini: { fallback: boolean; model: string };
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

  if (config.gemini.fallback) {
    try {
      const decrypted = execSync(
        `sops -d --extract '["GEMINI_API_KEY"]' ${config.secrets.globalSecretsFile}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      );
      return { mode: "gemini", apiKey: decrypted.trim(), model: config.gemini.model };
    } catch {
      // Decryption failed — fall through to error
    }
  }

  throw new Error(
    "No auth available. Max credentials not found at ~/.claude.json, and API/Gemini fallback is disabled or decryption failed.",
  );
}

export function resolveAuditAuth(config: AuthConfig, auditModel: string): AuthResult {
  // Audit always runs via API with the specified model (Opus).
  // Max plan does not support Opus model selection, so we force API mode.
  if (config.api?.fallback && config.api?.key) {
    return {
      mode: 'api' as AuthMode,
      apiKey: config.api.key,
      model: auditModel,
    };
  }
  // If no API key configured, fall back to max with default model.
  // This is degraded mode — Opus won't be used, but execution continues.
  if (isMaxAvailable()) {
    return {
      mode: 'max' as AuthMode,
      model: auditModel,
    };
  }
  throw new Error('Audit requires API key for Opus model. Configure api.key in ~/.noxdev/config.json');
}
