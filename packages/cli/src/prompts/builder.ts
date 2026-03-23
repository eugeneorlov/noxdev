import type { ParsedTask } from '../parser/tasks.js';
import type { ProjectConfig } from '../config/types.js';

export interface PromptContext {
  task: ParsedTask;
  projectConfig: ProjectConfig;
  worktreePath: string;
  runId: string;
  attempt: number;
  previousError?: string;
}

export function buildTaskPrompt(ctx: PromptContext): string {
  const { task, projectConfig, worktreePath, attempt, previousError } = ctx;

  const filesSection =
    task.files.length > 0
      ? task.files.join('\n')
      : 'No specific files listed.';

  let prompt = `You are an autonomous coding agent working on project "${projectConfig.display_name}".
Working directory: ${worktreePath}

## Task: ${task.taskId} — ${task.title}

${task.spec}

## Files to focus on (hints, not constraints):
${filesSection}

## Verification:
After completing the task, run: ${task.verify}
If the verification command fails, fix the issue and re-run until it passes.
`;

  if (attempt > 1 && previousError) {
    prompt += `
## Previous attempt failed:
${previousError}
Analyze what went wrong and try a different approach.
`;
  }

  prompt += `
## Rules:
- Make only the changes needed for this task. Do not refactor unrelated code.
- Commit your changes with message: "noxdev(${task.taskId}): ${task.title}"
- Do not push to any remote.
- If you cannot complete the task, create a file FAILED.md explaining what went wrong.
`;

  return prompt;
}

export function buildCriticPrompt(task: ParsedTask, diffContent: string): string {
  return `You are a code review critic. Review this diff for task "${task.taskId}: ${task.title}".

## Task specification:
${task.spec}

## Diff to review:
\`\`\`
${diffContent}
\`\`\`

## Review checklist:
1. Does the diff implement what the spec asks for? (correctness)
2. Are changes scoped to the task? No unrelated modifications? (scope)
3. Are there security issues? (credential exposure, injection, missing validation)
4. Does the code follow existing patterns in the project?

Respond with APPROVED or REJECTED followed by a brief explanation.
If REJECTED, explain what needs to change.
`;
}
