import type { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline";
import { getDb } from "../db/index.js";
import { getLatestRun, getProject, getAllProjects } from "../db/queries.js";
import {
  getMergeCandidates,
  getDiffStats,
  getFullDiff,
  applyMergeDecisions,
  type MergeCandidate,
  type MergeDecision,
} from "../merge/interactive.js";

interface ProjectRow {
  id: string;
  display_name: string;
  worktree_path: string;
  repo_path: string;
  branch: string;
}

interface RunRow {
  id: string;
}

function askQuestion(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim().toLowerCase()));
  });
}

async function reviewCandidate(
  rl: ReturnType<typeof createInterface>,
  candidate: MergeCandidate,
  worktreeDir: string,
): Promise<"approved" | "rejected" | "skipped"> {
  const shortSha = candidate.commitSha.slice(0, 7);
  let diffStats = "";
  try {
    diffStats = getDiffStats(worktreeDir, candidate.commitSha);
  } catch {
    diffStats = "(diff stats unavailable)";
  }

  console.log("");
  console.log(
    `${chalk.bold(candidate.taskId)}: ${candidate.title} [${candidate.status}]`,
  );
  console.log(`   commit: ${shortSha}  ${diffStats}`);

  while (true) {
    const answer = await askQuestion(
      rl,
      `   ${chalk.cyan("[a]pprove")}  ${chalk.red("[r]eject")}  ${chalk.yellow("[d]iff")}  ${chalk.gray("[s]kip")}  > `,
    );

    if (answer === "a") return "approved";
    if (answer === "r") return "rejected";
    if (answer === "s") return "skipped";
    if (answer === "d") {
      try {
        const diff = getFullDiff(worktreeDir, candidate.commitSha);
        console.log("");
        console.log(diff);
      } catch {
        console.log("   (could not load diff)");
      }
      // Re-prompt after showing diff (without skip option per spec)
      while (true) {
        const answer2 = await askQuestion(
          rl,
          `   ${chalk.cyan("[a]pprove")}  ${chalk.red("[r]eject")}  > `,
        );
        if (answer2 === "a") return "approved";
        if (answer2 === "r") return "rejected";
      }
    }
  }
}

export function registerMerge(program: Command): void {
  program
    .command("merge")
    .description("Merge completed branches")
    .argument("[project]", "project name")
    .action(async (project: string | undefined) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        const db = getDb();

        // Resolve project
        let projectId: string;
        if (project) {
          projectId = project;
        } else {
          const projects = getAllProjects(db) as ProjectRow[];
          if (projects.length === 0) {
            console.log(
              "No projects registered. Run: noxdev init <project> --repo <path>",
            );
            return;
          }
          if (projects.length === 1) {
            projectId = projects[0].id;
          } else {
            console.log(
              chalk.red(
                "Multiple projects found. Specify one: noxdev merge <project>",
              ),
            );
            return;
          }
        }

        const proj = getProject(db, projectId) as ProjectRow | null;
        if (!proj) {
          console.log(chalk.red(`Project not found: ${projectId}`));
          return;
        }

        const candidates = getMergeCandidates(db, projectId);
        if (candidates.length === 0) {
          console.log("No pending merge tasks.");
          return;
        }

        const run = getLatestRun(db, projectId) as RunRow | null;
        const runId = run?.id ?? "unknown";
        console.log(
          `Run ${runId}: ${chalk.bold(String(candidates.length))} tasks pending review`,
        );

        // Interactive review
        const decisions: MergeDecision[] = [];
        for (const candidate of candidates) {
          const decision = await reviewCandidate(rl, candidate, proj.worktree_path);
          decisions.push({
            taskResultId: candidate.taskResultId,
            taskId: candidate.taskId,
            decision,
          });
        }

        // Summary
        const approved = decisions.filter((d) => d.decision === "approved").length;
        const rejected = decisions.filter((d) => d.decision === "rejected").length;
        const skipped = decisions.filter((d) => d.decision === "skipped").length;

        console.log("");
        console.log(
          `Summary: ${chalk.green(String(approved))} approved, ${chalk.red(String(rejected))} rejected, ${chalk.gray(String(skipped))} skipped`,
        );

        if (approved > 0) {
          const confirm = await askQuestion(
            rl,
            `Merge ${approved} approved commits to main? [y/n] `,
          );
          if (confirm === "y") {
            const result = applyMergeDecisions(
              db,
              proj.worktree_path,
              proj.repo_path,
              decisions,
            );
            console.log(
              `Merged: ${result.merged}, Rejected: ${result.rejected}, Skipped: ${result.skipped}`,
            );
          } else {
            console.log("Merge cancelled.");
          }
        }

        console.log("Run 'git push origin main' when ready.");
      } catch (err: unknown) {
        console.error(
          chalk.red(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        process.exitCode = 1;
      } finally {
        rl.close();
      }
    });
}
