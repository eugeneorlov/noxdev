import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { openDb } from "../db/connection.js";

interface CheckResult {
  name: string;
  passed: boolean;
  critical: boolean;
  category: 'prerequisites' | 'managed';
  message?: string;
}

function runCheck(name: string, critical: boolean, category: 'prerequisites' | 'managed', checkFn: () => { passed: boolean; message?: string }): CheckResult {
  try {
    const result = checkFn();
    return { name, passed: result.passed, critical, category, message: result.message };
  } catch (error) {
    return {
      name,
      passed: false,
      critical,
      category,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatCheckResult(result: CheckResult): string {
  const symbol = result.passed ? chalk.green("✓") : (result.critical ? chalk.red("✗") : chalk.yellow("!"));
  const message = result.message ? ` ${result.message}` : "";
  return `[${symbol}] ${result.name}${message}`;
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Check prerequisites for running noxdev")
    .action(() => {
      console.log("noxdev doctor - checking prerequisites...\n");

      const checks: CheckResult[] = [];

      // 1. Node.js version (tiered check matching setup.ts)
      checks.push(runCheck("Node.js version (20-24 supported)", true, 'prerequisites', () => {
        const version = process.version;
        const major = parseInt(version.slice(1).split('.')[0], 10);
        if (major < 20) {
          return { passed: false, message: `Node 20+ required, found ${version}` };
        }
        if (major >= 25) {
          return { passed: false, message: `Node ${version} not supported (node:sqlite needs 20-24). Install Node 22 LTS.` };
        }
        if (major > 22) {
          return { passed: true, message: `${version} (untested, supported: 20.x, 22.x LTS)` };
        }
        return { passed: true, message: version };
      }));

      // 2. Docker installed
      checks.push(runCheck("Docker installed", true, 'prerequisites', () => {
        try {
          const output = execSync("docker --version", { encoding: "utf8" }).trim();
          return { passed: true, message: output };
        } catch {
          return { passed: false, message: "Docker not found. Install: https://docs.docker.com/get-docker/" };
        }
      }));

      // 3. Docker daemon running
      checks.push(runCheck("Docker daemon running", true, 'prerequisites', () => {
        try {
          execSync("docker info", { stdio: "pipe" });
          return { passed: true };
        } catch {
          return { passed: false, message: "Docker daemon not running. Start Docker Desktop or run: sudo systemctl start docker" };
        }
      }));

      // 4. Docker image exists
      checks.push(runCheck("Docker image exists", false, 'managed', () => {
        try {
          const output = execSync("docker images -q noxdev-runner:latest", { encoding: "utf8" }).trim();
          if (output) {
            return { passed: true };
          } else {
            return { passed: false, message: "noxdev-runner image not found. Run: noxdev setup" };
          }
        } catch {
          return { passed: false, message: "noxdev-runner image not found. Run: noxdev setup" };
        }
      }));

      // 5. noxdev config directory
      checks.push(runCheck("noxdev config directory", false, 'managed', () => {
        const configDir = join(homedir(), ".noxdev");
        if (existsSync(configDir)) {
          return { passed: true };
        } else {
          return { passed: false, message: "No config directory. Run: noxdev setup" };
        }
      }));

      // 6. SQLite database
      checks.push(runCheck("SQLite database", false, 'managed', () => {
        const dbPath = join(homedir(), ".noxdev", "ledger.db");
        if (!existsSync(dbPath)) {
          return { passed: false, message: "No database. Run: noxdev setup" };
        }

        try {
          const db = openDb(dbPath, { readonly: true });
          const result = db.prepare("SELECT count(*) as count FROM projects").get() as { count: number };
          db.close();
          return { passed: true, message: `${result.count} projects registered` };
        } catch {
          return { passed: false, message: "No database. Run: noxdev setup" };
        }
      }));

      // 7. Git installed
      checks.push(runCheck("Git installed", true, 'prerequisites', () => {
        try {
          execSync("git --version", { stdio: "pipe" });
          return { passed: true };
        } catch {
          return { passed: false };
        }
      }));

      // 8. SOPS installed
      checks.push(runCheck("SOPS installed", false, 'prerequisites', () => {
        try {
          execSync("sops --version", { stdio: "pipe" });
          return { passed: true };
        } catch {
          return { passed: false, message: "SOPS not found. Secrets encryption unavailable." };
        }
      }));

      // 9. Python3 version (informational)
      checks.push(runCheck("Python3 version", false, 'prerequisites', () => {
        try {
          const output = execSync("python3 --version", { encoding: "utf8" }).trim();
          return { passed: true, message: output };
        } catch {
          return { passed: false, message: "python3 not found (not required for noxdev - available in Docker)" };
        }
      }));

      // 10. uv version (informational)
      checks.push(runCheck("uv version", false, 'prerequisites', () => {
        try {
          const output = execSync("uv --version", { encoding: "utf8" }).trim();
          return { passed: true, message: output };
        } catch {
          return { passed: false, message: "uv not found (not required for noxdev - available in Docker)" };
        }
      }));

      // 11. Claude credentials
      checks.push(runCheck("Claude credentials", true, 'prerequisites', () => {
        const claudePath = join(homedir(), ".claude.json");
        if (existsSync(claudePath)) {
          return { passed: true };
        } else {
          return { passed: false, message: "Claude credentials not found. Run: claude login" };
        }
      }));

      // Print results grouped by category
      const prerequisiteChecks = checks.filter(c => c.category === 'prerequisites');
      const managedChecks = checks.filter(c => c.category === 'managed');

      console.log(chalk.bold("Prerequisites"));
      console.log("These must be installed by you:");
      for (const check of prerequisiteChecks) {
        console.log(formatCheckResult(check));
      }

      console.log(chalk.bold("\nManaged by noxdev"));
      console.log("These are created and managed by noxdev:");
      for (const check of managedChecks) {
        console.log(formatCheckResult(check));
      }

      // Summary
      const passed = checks.filter(c => c.passed).length;
      const total = checks.length;
      const criticalFailed = checks.some(c => c.critical && !c.passed);

      console.log(`\n${passed}/${total} checks passed. ${criticalFailed ? "Issues found" : "Ready"}`);

      // Exit code
      if (criticalFailed) {
        process.exitCode = 1;
      }
    });
}