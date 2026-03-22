#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerRunCommand } from "./commands/run.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerLogCommand } from "./commands/log.js";
import { registerMergeCommand } from "./commands/merge.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerDashboardCommand } from "./commands/dashboard.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program
  .name("noxdev")
  .description("Autonomous overnight coding agent orchestrator")
  .version(version);

registerInitCommand(program);
registerRunCommand(program);
registerStatusCommand(program);
registerLogCommand(program);
registerMergeCommand(program);
registerProjectsCommand(program);
registerDashboardCommand(program);

program.parse();
