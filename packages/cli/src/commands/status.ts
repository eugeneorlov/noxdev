import type { Command } from "commander";

export function registerStatusCommand(program: Command): void {
  program
    .command("status [project]")
    .description("Show project status")
    .action(() => {
      console.log("noxdev status — not yet implemented");
    });
}
