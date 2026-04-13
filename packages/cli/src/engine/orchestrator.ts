import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, unlinkSync, readFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import chalk from "chalk";
import type { RunContext, TaskExecResult } from "./types.js";
import { parseTasksFromFile } from "../parser/tasks.js";
import type { ParsedTask } from "../parser/tasks.js";
import { updateTaskStatus } from "../parser/status-update.js";
import { buildTaskPrompt, buildCriticPrompt } from "../prompts/builder.js";
import { runTaskInDocker, captureDiff } from "../docker/runner.js";
import {
  insertRun,
  insertTaskCache,
  insertTaskResult,
  updateRunFinished,
} from "../db/queries.js";
import { findLatestSessionFile, parseSessionUsage } from "../cost/parser.js";
import { computeCostUsd } from "../cost/pricing.js";

function getCurrentSha(cwd: string): string {
  return execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" }).trim();
}

function isoNow(): string {
  return new Date().toISOString();
}

function captureTaskCost(
  worktreePath: string,
  containerStartMs: number,
  authMode: string,
): {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  model: string | null;
  auth_mode_cost: string;
  cost_usd: number;
} {
  const jsonlPath = findLatestSessionFile(worktreePath, containerStartMs);

  if (jsonlPath === null) {
    // No session file found, return all-zero cost fields
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      model: null,
      auth_mode_cost: authMode,
      cost_usd: 0,
    };
  }

  const usage = parseSessionUsage(jsonlPath);
  const costUsd = computeCostUsd(usage);

  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_write_tokens: usage.cache_write_tokens,
    model: usage.model,
    auth_mode_cost: authMode,
    cost_usd: costUsd,
  };
}

export async function executeRun(ctx: RunContext): Promise<void> {
  // Credential paths - defined as constants at the top
  const claudeJsonSrc = join(homedir(), '.claude.json');
  const claudeSnapshot = join(homedir(), '.noxdev', '.claude-snapshot.json');

  // Create credential snapshot ONCE at the very start before any Docker containers
  if (existsSync(claudeJsonSrc)) {
    mkdirSync(join(homedir(), '.noxdev'), { recursive: true });
    copyFileSync(claudeJsonSrc, claudeSnapshot);
    console.log(chalk.dim('  Credential snapshot saved'));
  }

  const tasksFile = join(ctx.worktreeDir, ctx.projectConfig.tasks_file);
  const pendingTasks = parseTasksFromFile(tasksFile);

  if (pendingTasks.length === 0) {
    console.log("No pending tasks");
    return;
  }

  // Get current git SHA
  const commitBefore = getCurrentSha(ctx.worktreeDir);

  // Insert run into SQLite
  const logDir = join(homedir(), ".noxdev", "logs", ctx.runId);
  insertRun(ctx.db, {
    id: ctx.runId,
    projectId: ctx.projectId,
    startedAt: isoNow(),
    authMode: ctx.auth.mode,
    totalTasks: pendingTasks.length,
    commitBefore,
    logFile: logDir,
  });

  // Cache parsed tasks in SQLite
  insertTaskCache(
    ctx.db,
    ctx.runId,
    pendingTasks.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      files: t.files.join(","),
      verify: t.verify,
      critic: t.critic,
      push: t.push,
      spec: t.spec,
      statusBefore: t.status,
    })),
  );

  // Print run header
  console.log(
    chalk.bold(
      `noxdev run ${ctx.projectId} — ${pendingTasks.length} pending tasks`,
    ),
  );

  // Initialize counters
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let consecutiveFailures = 0;

  const maxRetries = ctx.projectConfig.docker?.timeout_minutes
    ? 1
    : 1; // default retry count
  const circuitBreakerThreshold = 3;

  let lastSha = commitBefore;

  for (const task of pendingTasks) {
    // Circuit breaker check
    if (consecutiveFailures >= circuitBreakerThreshold) {
      console.log(
        chalk.yellow(
          `⚠ Circuit breaker: ${consecutiveFailures} consecutive failures, stopping run`,
        ),
      );
      skipped += pendingTasks.length - completed - failed;
      break;
    }

    const result = await executeTask(ctx, task, lastSha, logDir, 1, maxRetries, claudeJsonSrc, claudeSnapshot);

    // Update lastSha if commit happened
    if (result.commitSha) {
      lastSha = result.commitSha;
    }

    // Update TASKS.md
    const newStatus = result.status === "COMPLETED" ? "done" : "failed";
    try {
      updateTaskStatus(tasksFile, task.taskId, newStatus);
    } catch {
      // Non-fatal: log but continue
      console.log(
        chalk.yellow(`⚠ Could not update TASKS.md status for ${task.taskId}`),
      );
    }

    // Update counters
    if (result.status === "COMPLETED") {
      completed++;
      consecutiveFailures = 0;
    } else {
      failed++;
      consecutiveFailures++;
    }
  }

  // Get final git SHA
  const commitAfter = getCurrentSha(ctx.worktreeDir);

  // Determine overall run status
  const runStatus = failed === 0 ? "completed" : "partial";

  // Update run in SQLite
  updateRunFinished(ctx.db, ctx.runId, {
    finishedAt: isoNow(),
    completed,
    failed,
    skipped,
    status: runStatus,
    commitAfter,
  });

  // Print summary
  const parts: string[] = [];
  if (completed > 0) parts.push(chalk.green(`${completed} completed`));
  if (failed > 0) parts.push(chalk.red(`${failed} failed`));
  if (skipped > 0) parts.push(chalk.yellow(`${skipped} skipped`));

  console.log(`\nRun ${ctx.runId} complete: ${parts.join(", ")}`);
}

async function executeTask(
  ctx: RunContext,
  task: ParsedTask,
  lastSha: string,
  logDir: string,
  attempt: number,
  maxRetries: number,
  claudeJsonSrc: string,
  claudeSnapshot: string,
  previousError?: string,
): Promise<TaskExecResult> {
  // Print task header
  console.log(chalk.bold(`\n━━━ ${task.taskId}: ${task.title} ━━━`));
  if (attempt > 1) {
    console.log(chalk.yellow(`  Retry attempt ${attempt}`));
  }

  const startedAt = isoNow();
  const startTime = Date.now();

  // Build prompt
  const prompt = buildTaskPrompt({
    task,
    projectConfig: ctx.projectConfig,
    worktreePath: ctx.worktreeDir,
    runId: ctx.runId,
    attempt,
    previousError,
  });

  // Write prompt to temp file
  const promptFile = join(
    tmpdir(),
    `noxdev-prompt-${ctx.runId}-${task.taskId}.md`,
  );
  writeFileSync(promptFile, prompt, "utf-8");

  // Create task log path
  const taskLogDir = join(logDir, task.taskId);
  mkdirSync(taskLogDir, { recursive: true });
  const taskLog = join(taskLogDir, `attempt-${attempt}.log`);

  // Restore credential snapshot before Docker launch
  if (existsSync(claudeSnapshot)) {
    copyFileSync(claudeSnapshot, claudeJsonSrc);
  }

  // Capture container start time for cost tracking
  const containerStartMs = Date.now();

  // Run task in Docker
  const timeoutSeconds = ctx.projectConfig.docker.timeout_minutes * 60;
  const dockerResult = runTaskInDocker(
    {
      promptFile,
      taskLog,
      timeoutSeconds,
      worktreeDir: ctx.worktreeDir,
      projectGitDir: ctx.projectGitDir,
      gitTargetPath: ctx.gitTargetPath,
      memoryLimit: ctx.projectConfig.docker.memory,
      cpuLimit: ctx.projectConfig.docker.cpus,
      dockerImage: "noxdev-runner:latest",
    },
    ctx.auth,
  );

  const endTime = Date.now();
  const durationSeconds = Math.round((endTime - startTime) / 1000);

  // Check for commit: see if HEAD changed
  let commitSha: string | null = null;
  try {
    const currentSha = getCurrentSha(ctx.worktreeDir);
    if (currentSha !== lastSha) {
      commitSha = currentSha;
    }
  } catch {
    // Could not get SHA — leave as null
  }

  // Determine status
  let status = dockerResult.exitCode === 0 ? "COMPLETED" : "FAILED";

  // If failed and retries remain, retry with error context
  if (status === "FAILED" && attempt < maxRetries) {
    // Read last lines of log for error context
    let errorContext = `Exit code: ${dockerResult.exitCode}`;
    try {
      const logContent = readFileSync(taskLog, "utf-8");
      const lines = logContent.split("\n");
      errorContext = lines.slice(-50).join("\n");
    } catch {
      // Use default error context
    }

    // Clean up prompt file before retry
    try {
      unlinkSync(promptFile);
    } catch {
      // ignore
    }

    return executeTask(
      ctx,
      task,
      commitSha ?? lastSha,
      logDir,
      attempt + 1,
      maxRetries,
      claudeJsonSrc,
      claudeSnapshot,
      errorContext,
    );
  }

  // Critic review (if task has critic='review' and status is COMPLETED)
  let criticLogFile: string | null = null;
  let diffFile: string | null = null;

  if (task.critic === "review" && status === "COMPLETED") {
    const criticResult = await runCritic(ctx, task, logDir, attempt, claudeJsonSrc, claudeSnapshot);
    criticLogFile = criticResult.criticLogFile;
    diffFile = criticResult.diffFile;

    if (criticResult.rejected) {
      status = "FAILED";

      // If retries remain after critic rejection, retry
      if (attempt < maxRetries) {
        try {
          unlinkSync(promptFile);
        } catch {
          // ignore
        }

        return executeTask(
          ctx,
          task,
          commitSha ?? lastSha,
          logDir,
          attempt + 1,
          maxRetries,
          claudeJsonSrc,
          claudeSnapshot,
          `Critic rejected the changes: ${criticResult.reason}`,
        );
      }
    }
  }

  const finishedAt = isoNow();

  // Capture token usage and cost from the Claude Code session JSONL
  const costData = captureTaskCost(ctx.worktreeDir, containerStartMs, ctx.auth.mode);

  // Insert task result into SQLite
  insertTaskResult(ctx.db, {
    runId: ctx.runId,
    taskId: task.taskId,
    title: task.title,
    status,
    exitCode: dockerResult.exitCode,
    authMode: ctx.auth.mode,
    criticMode: task.critic,
    pushMode: task.push,
    attempt,
    commitSha,
    startedAt,
    finishedAt,
    durationSeconds,
    devLogFile: taskLog,
    criticLogFile,
    diffFile,
    inputTokens: costData.input_tokens,
    outputTokens: costData.output_tokens,
    cacheReadTokens: costData.cache_read_tokens,
    cacheWriteTokens: costData.cache_write_tokens,
    model: costData.model,
    authModeCost: costData.auth_mode_cost,
    costUsd: costData.cost_usd,
  });

  // Print result
  if (status === "COMPLETED") {
    console.log(
      chalk.green(`  ✓ ${task.taskId} completed in ${durationSeconds}s`),
    );
  } else {
    console.log(
      chalk.red(
        `  ✗ ${task.taskId} failed (exit ${dockerResult.exitCode}) in ${durationSeconds}s`,
      ),
    );
  }

  // Clean up temp prompt file
  try {
    unlinkSync(promptFile);
  } catch {
    // ignore
  }

  return {
    taskId: task.taskId,
    title: task.title,
    status,
    exitCode: dockerResult.exitCode,
    commitSha,
    durationSeconds,
    attempt,
  };
}

async function runCritic(
  ctx: RunContext,
  task: ParsedTask,
  logDir: string,
  attempt: number,
  claudeJsonSrc: string,
  claudeSnapshot: string,
): Promise<{
  rejected: boolean;
  reason: string;
  criticLogFile: string | null;
  diffFile: string | null;
}> {
  console.log(chalk.dim(`  Running critic review for ${task.taskId}…`));

  const taskLogDir = join(logDir, task.taskId);
  const diffOutputFile = join(taskLogDir, `diff-attempt-${attempt}.patch`);

  // Capture diff
  const hasDiff = captureDiff(ctx.worktreeDir, diffOutputFile);
  if (!hasDiff) {
    console.log(chalk.yellow("  ⚠ No diff to review, skipping critic"));
    return { rejected: false, reason: "", criticLogFile: null, diffFile: null };
  }

  // Read diff content
  const diffContent = readFileSync(diffOutputFile, "utf-8");

  // Build critic prompt
  const criticPromptContent = buildCriticPrompt(task, diffContent);
  const criticPromptFile = join(
    tmpdir(),
    `noxdev-critic-${ctx.runId}-${task.taskId}.md`,
  );
  writeFileSync(criticPromptFile, criticPromptContent, "utf-8");

  // Restore credential snapshot before Docker launch
  if (existsSync(claudeSnapshot)) {
    copyFileSync(claudeSnapshot, claudeJsonSrc);
  }

  // Run critic in Docker with shorter timeout (120s)
  const criticLog = join(taskLogDir, `critic-attempt-${attempt}.log`);
  const criticResult = runTaskInDocker(
    {
      promptFile: criticPromptFile,
      taskLog: criticLog,
      timeoutSeconds: 120,
      worktreeDir: ctx.worktreeDir,
      projectGitDir: ctx.projectGitDir,
      gitTargetPath: ctx.gitTargetPath,
      memoryLimit: ctx.projectConfig.docker.memory,
      cpuLimit: ctx.projectConfig.docker.cpus,
      dockerImage: "noxdev-runner:latest",
    },
    ctx.auth,
  );

  // Clean up critic prompt file
  try {
    unlinkSync(criticPromptFile);
  } catch {
    // ignore
  }

  // Parse critic output for APPROVED/REJECTED
  let rejected = false;
  let reason = "";

  try {
    const criticOutput = readFileSync(criticLog, "utf-8");
    if (/\bREJECTED\b/i.test(criticOutput)) {
      rejected = true;
      // Extract reason: text after REJECTED
      const match = criticOutput.match(/REJECTED[:\s]*(.*)/i);
      reason = match?.[1]?.trim() ?? "Critic rejected without explanation";
      console.log(chalk.red(`  ✗ Critic REJECTED: ${reason}`));
    } else {
      console.log(chalk.green("  ✓ Critic APPROVED"));
    }
  } catch {
    // Could not read critic output — treat as approved
    console.log(chalk.yellow("  ⚠ Could not read critic output, assuming approved"));
  }

  return {
    rejected,
    reason,
    criticLogFile: criticLog,
    diffFile: diffOutputFile,
  };
}
