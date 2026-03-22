import type { Command } from "commander";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show project status")
    .argument("[project]", "project name")
    .action((project: string | undefined) => {
      console.log("noxdev status — not yet implemented");
    });
}
