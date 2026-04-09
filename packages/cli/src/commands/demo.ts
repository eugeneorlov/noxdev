import type { Command } from "commander";
import chalk from "chalk";

export function registerDemo(program: Command): void {
  program
    .command("demo")
    .description("Run a demo to see noxdev build a project autonomously")
    .action(async () => {
      try {
        await runDemo();
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

async function runDemo(): Promise<void> {
  console.log(chalk.bold('\n🎭 noxdev demo\n'));

  console.log(chalk.cyan('This command will show you how noxdev works by building a sample project.'));
  console.log(chalk.gray('Demo functionality coming soon...\n'));

  // TODO: Implement demo logic
  // This should demonstrate noxdev's capabilities by:
  // 1. Creating a sample project or using a template
  // 2. Running noxdev on it to show autonomous coding
  // 3. Displaying the results and workflow

  console.log(chalk.green('✓ Demo command is available'));
  console.log(chalk.gray('\nFor now, try these commands:'));
  console.log(chalk.gray('  noxdev setup     # Set up noxdev for first use'));
  console.log(chalk.gray('  noxdev init      # Initialize a new project'));
  console.log(chalk.gray('  noxdev run       # Run noxdev on a project'));
}