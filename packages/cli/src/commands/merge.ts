import type { Command } from "commander";

export function registerMergeCommand(program: Command): void {
  program
    .command("merge [project]")
    .description("Merge completed branches")
    .action(() => {
      console.log("noxdev merge — not yet implemented");
    });
}
