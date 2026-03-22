import type { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init <project>")
    .description("Initialize a new project")
    .option("--repo <url>", "Repository URL")
    .action(() => {
      console.log("noxdev init — not yet implemented");
    });
}
