import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthConfig } from "../index.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolveAuth, isMaxAvailable } from "../index.js";

const baseConfig: AuthConfig = {
  max: { preferred: true },
  api: { fallback: true, dailyCapUsd: 5, model: "claude-sonnet-4-20250514" },
  secrets: {
    provider: "sops-age",
    globalSecretsFile: "/secrets/global.enc.json",
    ageKeyFile: "~/.config/sops/age/keys.txt",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("resolveAuth", () => {
  it("returns max mode when max preferred and credentials exist", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"token":"abc"}');

    const result = resolveAuth(baseConfig);

    expect(result).toEqual({
      mode: "max",
      model: "claude-sonnet-4-20250514",
    });
    expect(result.apiKey).toBeUndefined();
  });

  it("falls back to api mode when max credentials missing and api fallback enabled", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(execSync).mockReturnValue("sk-ant-test-key\n");

    const result = resolveAuth(baseConfig);

    expect(result).toEqual({
      mode: "api",
      apiKey: "sk-ant-test-key",
      model: "claude-sonnet-4-20250514",
    });
  });

  it("throws when max credentials missing and api fallback disabled", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const config: AuthConfig = {
      ...baseConfig,
      api: { ...baseConfig.api, fallback: false },
    };

    expect(() => resolveAuth(config)).toThrow(
      "No auth available. Max credentials not found at ~/.claude.json and API fallback is disabled or decryption failed.",
    );
  });
});

describe("isMaxAvailable", () => {
  it("returns true when credential file exists and is non-empty", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"token":"abc"}');

    expect(isMaxAvailable()).toBe(true);
  });

  it("returns false when credential file does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(isMaxAvailable()).toBe(false);
  });
});
