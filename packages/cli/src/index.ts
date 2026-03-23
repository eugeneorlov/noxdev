import { createRequire } from "node:module";
import { Command } from "commander";
import { registerInit } from "./commands/init.js";
import { registerRun } from "./commands/run.js";
import { registerStatus } from "./commands/status.js";
import { registerLog } from "./commands/log.js";
import { registerMerge } from "./commands/merge.js";
import { registerProjects } from "./commands/projects.js";
import { registerDashboard } from "./commands/dashboard.js";
import { registerDoctor } from "./commands/doctor.js";

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
registerMerge(program);
registerProjects(program);
registerDashboard(program);
registerDoctor(program);

program.parse();
