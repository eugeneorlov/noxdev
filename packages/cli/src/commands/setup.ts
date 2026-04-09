import type { Command } from "commander";
import chalk from "chalk";

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Set up noxdev environment and dependencies")
    .action(async () => {
      try {
        await runSetup();
      } catch (err: unknown) {
        console.error(
          chalk.red(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exitCode = 1;
      }
    });
}

async function runSetup(): Promise<void> {
  console.log(chalk.yellow("Setup command is not yet implemented"));
  console.log("This command will configure noxdev environment and dependencies");
  // TODO: Implement setup logic in T4
}