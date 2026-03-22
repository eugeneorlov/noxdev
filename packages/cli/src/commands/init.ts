import type { Command } from "commander";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize a new project")
    .argument("<project>", "project name")
    .option("--repo <repo>", "repository URL")
    .action((project: string, opts: { repo?: string }) => {
      console.log("noxdev init — not yet implemented");
    });
}
