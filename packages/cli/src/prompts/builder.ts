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
Before reporting this task as complete, execute the VERIFY command as a real shell command in the worktree. Include the exact command output and exit code in your completion summary. If the VERIFY command exits non-zero, iterate on your changes until it passes, or report the failure honestly — do not claim success based on reasoning alone.
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

export function buildAuditFixPrompt(
  task: ParsedTask,
  diffContent: string,
  gapFilePath: string,
  previousGapAnalysis?: string,
): string {
  const preamble = [
    'CRITICAL CONSTRAINT: The SPEC below is the sole source of truth.',
    'Do NOT deviate from it. Do NOT improve it. Do NOT reinterpret it.',
    'If the spec is ambiguous, implement the most literal reading.',
    'If the spec is impossible, write the reason to the gap analysis file and stop.',
  ].join('\n');

  let prompt = `${preamble}

You are an autonomous coding agent conducting a comprehensive audit and fix process.

## Task: ${task.taskId} — ${task.title}

## SPEC (sole source of truth):
${task.spec}

## Current Implementation Diff:
\`\`\`
${diffContent}
\`\`\`

## Your Process:

### Phase 1: AUDIT
1. Carefully compare the current implementation diff against the SPEC above
2. Identify every gap, missing requirement, or deviation from the spec
3. Write a detailed gap analysis to: ${gapFilePath}

### Phase 2: FIX
1. Read your gap analysis file
2. Fix ALL identified gaps by modifying the code
3. Make only the changes needed to satisfy the SPEC exactly
4. Do not add features not in the SPEC
5. Do not refactor unrelated code

## Gap Analysis File Format:
Write to ${gapFilePath} in this format:
\`\`\`
# Gap Analysis for ${task.taskId}

## Gaps Found:
1. [Description of gap 1]
2. [Description of gap 2]
...

## Implementation Plan:
1. [What needs to be changed to fix gap 1]
2. [What needs to be changed to fix gap 2]
...

## Status: [GAPS_FOUND | NO_GAPS | IMPOSSIBLE]
\`\`\``;

  if (previousGapAnalysis) {
    prompt += `

## Previous Gap Analysis:
\`\`\`
${previousGapAnalysis}
\`\`\`
Use this to understand what was previously attempted. Focus on any remaining gaps.`;
  }

  prompt += `

## Rules:
- The SPEC is absolute truth. Do not question or improve it.
- Audit first, then fix. Always write the gap analysis file.
- If SPEC is impossible to implement, explain why in gap analysis and stop.
- Make only the minimal changes needed to satisfy the SPEC.
- Commit your changes with message: "noxdev(${task.taskId}): ${task.title}"
- Do not push to any remote.
`;

  return prompt;
}
