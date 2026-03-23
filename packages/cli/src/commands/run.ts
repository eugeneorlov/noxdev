import type { Command } from "commander";
import { join } from "node:path";
import chalk from "chalk";
import { getDb } from "../db/index.js";
import { getAllProjects, getProject } from "../db/queries.js";
import { loadProjectConfig } from "../config/index.js";
import { loadGlobalConfig } from "../config/index.js";
import { resolveAuth } from "../auth/index.js";
import { executeRun } from "../engine/orchestrator.js";
import type { RunContext } from "../engine/types.js";

function generateRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

interface ProjectRow {
  id: string;
  display_name: string;
  repo_path: string;
  worktree_path: string;
  branch: string;
}

async function runProject(project: ProjectRow): Promise<void> {
  const db = getDb();
  const globalConfig = loadGlobalConfig();
  const projectConfig = loadProjectConfig(project.repo_path);

  // Resolve auth
  const auth = resolveAuth({
    max: { preferred: globalConfig.accounts.max.preferred },
    api: {
      fallback: globalConfig.accounts.api.fallback,
      dailyCapUsd: globalConfig.accounts.api.daily_cap_usd,
      model: globalConfig.accounts.api.model,
    },
    secrets: {
      provider: globalConfig.secrets.provider,
      globalSecretsFile: globalConfig.secrets.global,
      ageKeyFile: globalConfig.secrets.age_key,
    },
  });

  const runId = generateRunId();
  const gitDir = join(project.repo_path, ".git");

  const ctx: RunContext = {
    projectId: project.id,
    projectConfig,
    worktreeDir: project.worktree_path,
    projectGitDir: gitDir,
    gitTargetPath: project.worktree_path,
    runId,
    db,
    auth,
  };

  await executeRun(ctx);
}

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Run coding tasks")
    .argument("[project]", "project name")
    .option("--overnight", "run in overnight mode")
    .option("--all", "run for all projects")
    .action(
      async (
        project: string | undefined,
        opts: { overnight?: boolean; all?: boolean },
      ) => {
        try {
          if (opts.overnight) {
            console.log("overnight mode not yet implemented");
            return;
          }

          const db = getDb();

          if (opts.all) {
            const projects = getAllProjects(db) as ProjectRow[];
            if (projects.length === 0) {
              console.error(
                chalk.red(
                  "No projects registered. Run `noxdev init` first.",
                ),
              );
              process.exitCode = 1;
              return;
            }

            for (const proj of projects) {
              await runProject(proj);
            }
            return;
          }

          // Single project mode
          let projectRow: ProjectRow | null;

          if (project) {
            projectRow = getProject(db, project) as ProjectRow | null;
            if (!projectRow) {
              console.error(
                chalk.red(
                  `Project "${project}" not found. Run \`noxdev init ${project}\` first.`,
                ),
              );
              process.exitCode = 1;
              return;
            }
          } else {
            // No project specified — use the only one, or error if multiple
            const projects = getAllProjects(db) as ProjectRow[];
            if (projects.length === 0) {
              console.error(
                chalk.red(
                  "No projects registered. Run `noxdev init` first.",
                ),
              );
              process.exitCode = 1;
              return;
            }
            if (projects.length > 1) {
              console.error(
                chalk.red(
                  `Multiple projects registered. Specify one: ${projects.map((p) => p.id).join(", ")}`,
                ),
              );
              process.exitCode = 1;
              return;
            }
            projectRow = projects[0];
          }

          await runProject(projectRow);
        } catch (err: unknown) {
          console.error(
            chalk.red(
              `Error: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
          process.exitCode = 1;
        }
      },
    );
}
