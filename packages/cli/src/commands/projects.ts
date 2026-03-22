import type { Command } from "commander";

export function registerProjectsCommand(program: Command): void {
  program
    .command("projects")
    .description("List all projects")
    .action(() => {
      console.log("noxdev projects — not yet implemented");
    });
}
