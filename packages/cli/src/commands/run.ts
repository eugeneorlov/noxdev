import type { Command } from "commander";

export function registerRunCommand(program: Command): void {
  program
    .command("run [project]")
    .description("Run coding tasks")
    .option("--overnight", "Run in overnight mode")
    .option("--all", "Run for all projects")
    .action(() => {
      console.log("noxdev run — not yet implemented");
    });
}
