import type { Command } from "commander";

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Open the dashboard")
    .action(() => {
      console.log("noxdev dashboard — not yet implemented");
    });
}
