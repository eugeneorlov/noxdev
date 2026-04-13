import { createRequire } from "node:module";
import { Command } from "commander";
import chalk from "chalk";
import { BANNER } from "./brand.js";
import { registerInit } from "./commands/init.js";
import { registerRun } from "./commands/run.js";
import { registerStatus } from "./commands/status.js";
import { registerLog } from "./commands/log.js";
import { registerProjects } from "./commands/projects.js";
import { registerDashboard } from "./commands/dashboard.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerRemove } from "./commands/remove.js";
import { registerSetup } from "./commands/setup.js";
import { registerDemo } from "./commands/demo.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program
  .name("noxdev")
  .description("Autonomous overnight coding agent orchestrator")
  .version(version);

registerInit(program);
registerRun(program);
registerStatus(program);
registerLog(program);
registerProjects(program);
registerDashboard(program);
registerDoctor(program);
registerRemove(program);
registerSetup(program);
registerDemo(program);

// Check if no subcommand is provided (just "noxdev" or "noxdev --help")
const args = process.argv.slice(2);
const hasNoSubcommand = args.length === 0 || (args.length === 1 && args[0].startsWith('-'));

if (hasNoSubcommand && !args.includes('--version') && !args.includes('-V')) {
  // Show banner with muted gold color
  console.log(chalk.hex('#C9A84C')(BANNER(version)));
  console.log(); // Add blank line
}

program.parse();
