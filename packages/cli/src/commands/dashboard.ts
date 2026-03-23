import type { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import express from "express";

export function registerDashboard(program: Command): void {
  program
    .command("dashboard")
    .description("Launch the noxdev dashboard (API + UI)")
    .option("--port <port>", "frontend port", "4401")
    .option("--api-port <port>", "API port", "4400")
    .action(async (opts: { port: string; apiPort: string }) => {
      // Look for bundled dashboard first (npm global install), then monorepo path (dev)
      const bundledDashboard = path.resolve(import.meta.dirname, '..', 'dashboard');
      const monorepoDevDashboard = path.resolve(import.meta.dirname, '..', '..', '..', 'packages', 'dashboard');
      const dashboardDir = existsSync(path.join(bundledDashboard, 'index.html'))
        ? bundledDashboard
        : monorepoDevDashboard;

      if (!existsSync(dashboardDir)) {
        console.error(chalk.red("Dashboard not found. Run 'pnpm build' in the noxdev monorepo first."));
        process.exitCode = 1;
        return;
      }

      const isBundled = existsSync(path.join(dashboardDir, 'index.html'));

      if (isBundled) {
        // Bundled mode: serve static files from Express server
        console.log(chalk.bold("noxdev dashboard"));
        console.log(`  Dashboard: http://localhost:${opts.apiPort}`);
        console.log("  Press Ctrl+C to stop");

        const app = express();

        // Mount API routes first
        try {
          const serverModule = await import(path.resolve(dashboardDir, 'dist', 'api', 'server.js'));
          // The server.js exports an app with routes already mounted
          // We need to copy the routes to our app
          const apiApp = serverModule.app;
          if (apiApp && apiApp._router) {
            // Mount the entire API router
            app.use(apiApp);
          }
        } catch (error) {
          console.warn('Could not load API routes:', error);
          // Fallback health check
          app.get('/api/health', (req: any, res: any) => {
            res.json({ status: 'ok', db: false });
          });
        }

        // Serve static dashboard files for all other routes
        app.use(express.static(dashboardDir));

        // Handle React Router - serve index.html for non-API routes
        app.get('*', (req, res) => {
          res.sendFile(path.join(dashboardDir, 'index.html'));
        });

        const server = app.listen(parseInt(opts.apiPort), () => {
          console.log(chalk.green(`Dashboard running on http://localhost:${opts.apiPort}`));
        });

        // Handle cleanup
        const cleanup = () => {
          console.log(chalk.yellow("\nShutting down dashboard..."));
          server.close();
          process.exit(0);
        };

        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);

        // Keep the process alive
        await new Promise(() => {}); // Wait indefinitely
      } else {
        // Development mode: use existing logic
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
      }
    });
}
