import type { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

export function registerDashboard(program: Command): void {
  program
    .command("dashboard")
    .description("Launch the noxdev dashboard (API + UI)")
    .option("--port <port>", "frontend port", "4401")
    .option("--api-port <port>", "API port", "4400")
    .action(async (opts: { port: string; apiPort: string }) => {
      // Determine the dashboard package location
      const dashboardDir = path.resolve(import.meta.dirname, "..", "..", "..", "dashboard");

      if (!existsSync(dashboardDir)) {
        console.error(chalk.red("Dashboard not found. Run 'pnpm build' in the noxdev monorepo first."));
        process.exitCode = 1;
        return;
      }

      const apiServerPath = path.join(dashboardDir, "dist", "api", "server.js");
      if (!existsSync(apiServerPath)) {
        console.error(chalk.red("Dashboard API not built. Run 'pnpm build' in the noxdev monorepo first."));
        process.exitCode = 1;
        return;
      }

      console.log(chalk.bold("noxdev dashboard"));
      console.log(`  API:    http://localhost:${opts.apiPort}`);
      console.log(`  UI:     http://localhost:${opts.port}`);
      console.log("  Press Ctrl+C to stop");

      const processes: Array<ReturnType<typeof spawn>> = [];

      // Start the Express API server as a child process
      const apiProcess = spawn("node", [apiServerPath], {
        stdio: "pipe",
        env: { ...process.env, PORT: opts.apiPort }
      });

      processes.push(apiProcess);

      // Start the Vite dev server as a child process
      const uiProcess = spawn("npx", ["vite", "--port", opts.port, "--open"], {
        cwd: dashboardDir,
        stdio: "pipe"
      });

      processes.push(uiProcess);

      // Handle process outputs
      apiProcess.stdout?.on("data", (data) => {
        const lines = data.toString().split("\n").filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          console.log(chalk.blue("[API]"), line);
        });
      });

      apiProcess.stderr?.on("data", (data) => {
        const lines = data.toString().split("\n").filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          console.log(chalk.red("[API ERROR]"), line);
        });
      });

      uiProcess.stdout?.on("data", (data) => {
        const lines = data.toString().split("\n").filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          console.log(chalk.green("[UI]"), line);
        });
      });

      uiProcess.stderr?.on("data", (data) => {
        const lines = data.toString().split("\n").filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          console.log(chalk.yellow("[UI WARN]"), line);
        });
      });

      // Handle process exits
      apiProcess.on("exit", (code) => {
        if (code !== 0) {
          console.log(chalk.red(`API server exited with code ${code}`));
        }
      });

      uiProcess.on("exit", (code) => {
        if (code !== 0) {
          console.log(chalk.red(`UI server exited with code ${code}`));
        }
      });

      // Handle SIGINT: kill both child processes, exit cleanly
      const cleanup = () => {
        console.log(chalk.yellow("\nShutting down dashboard..."));
        processes.forEach((proc) => {
          if (!proc.killed) {
            proc.kill("SIGTERM");
          }
        });
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Wait for at least one process to exit
      await Promise.race([
        new Promise<void>((resolve) => apiProcess.on("exit", () => resolve())),
        new Promise<void>((resolve) => uiProcess.on("exit", () => resolve()))
      ]);

      cleanup();
    });
}
