import type { Command } from "commander";

export function registerLogCommand(program: Command): void {
  program
    .command("log <task-id>")
    .description("Show logs for a task")
    .action(() => {
      console.log("noxdev log — not yet implemented");
    });
}
