import type { Command } from "commander";

export function registerLog(program: Command): void {
  program
    .command("log")
    .description("Show task log")
    .argument("<task-id>", "task identifier")
    .action((taskId: string) => {
      console.log("noxdev log — not yet implemented");
    });
}
