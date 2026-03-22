import type { Command } from "commander";

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Run coding tasks")
    .argument("[project]", "project name")
    .option("--overnight", "run in overnight mode")
    .option("--all", "run for all projects")
    .action((project: string | undefined, opts: { overnight?: boolean; all?: boolean }) => {
      console.log("noxdev run — not yet implemented");
    });
}
