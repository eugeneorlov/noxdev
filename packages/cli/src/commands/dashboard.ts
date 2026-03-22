import type { Command } from "commander";

export function registerDashboard(program: Command): void {
  program
    .command("dashboard")
    .description("Open the dashboard")
    .action(() => {
      console.log("noxdev dashboard — not yet implemented");
    });
}
