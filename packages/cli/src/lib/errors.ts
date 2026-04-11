import chalk from "chalk";

export function dumpErr(err: unknown): void {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    if (e.stderr?.length) {
      console.error(chalk.gray('  ─ stderr ─'));
      console.error(chalk.gray('  ' + e.stderr.toString().trim().replace(/\n/g, '\n  ')));
    }
    if (e.stdout?.length) {
      console.error(chalk.gray('  ─ stdout ─'));
      console.error(chalk.gray('  ' + e.stdout.toString().trim().replace(/\n/g, '\n  ')));
    }
  }
}