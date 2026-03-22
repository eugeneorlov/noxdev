import type { Command } from "commander";

export function registerMerge(program: Command): void {
  program
    .command("merge")
    .description("Merge completed branches")
    .argument("[project]", "project name")
    .action((project: string | undefined) => {
      console.log("noxdev merge — not yet implemented");
    });
}
