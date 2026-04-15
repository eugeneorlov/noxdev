import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, buildCriticPrompt, type PromptContext } from '../builder.js';
import type { ParsedTask } from '../../parser/tasks.js';
import type { ProjectConfig } from '../../config/types.js';

function makeTask(overrides: Partial<ParsedTask> = {}): ParsedTask {
  return {
    taskId: 'T1',
    title: 'Add login feature',
    status: 'pending',
    files: ['src/auth.ts', 'src/routes/login.ts'],
    verify: 'pnpm test',
    critic: 'on',
    spec: 'Implement JWT-based login endpoint.',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    project: 'myapp',
    display_name: 'My App',
    test_command: 'pnpm test',
    build_command: 'pnpm build',
    lint_command: 'pnpm lint',
    docker: { memory: '2g', cpus: 2, timeout_minutes: 30 },
    secrets: '',
    tasks_file: 'TASKS.md',
    critic_default: 'on',
    push_default: 'off',
    ...overrides,
  };
}

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    task: makeTask(),
    projectConfig: makeConfig(),
    worktreePath: '/tmp/worktree/abc',
    runId: 'run-001',
    attempt: 1,
    ...overrides,
  };
}

describe('buildTaskPrompt', () => {
  it('includes taskId, title, spec, files, and verify command', () => {
    const prompt = buildTaskPrompt(makeContext());

    expect(prompt).toContain('T1');
    expect(prompt).toContain('Add login feature');
    expect(prompt).toContain('Implement JWT-based login endpoint.');
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('src/routes/login.ts');
    expect(prompt).toContain('pnpm test');
    expect(prompt).toContain('"My App"');
    expect(prompt).toContain('/tmp/worktree/abc');
  });

  it('shows "No specific files listed." when files array is empty', () => {
    const ctx = makeContext({ task: makeTask({ files: [] }) });
    const prompt = buildTaskPrompt(ctx);

    expect(prompt).toContain('No specific files listed.');
  });

  it('includes previous error section when attempt > 1 and previousError is provided', () => {
    const ctx = makeContext({
      attempt: 2,
      previousError: 'TypeError: cannot read property of undefined',
    });
    const prompt = buildTaskPrompt(ctx);

    expect(prompt).toContain('## Previous attempt failed:');
    expect(prompt).toContain('TypeError: cannot read property of undefined');
    expect(prompt).toContain('Analyze what went wrong and try a different approach.');
  });

  it('does not include previous attempt section on attempt 1', () => {
    const prompt = buildTaskPrompt(makeContext({ attempt: 1 }));

    expect(prompt).not.toContain('Previous attempt failed');
  });
});

describe('buildCriticPrompt', () => {
  it('includes spec, diff content, and review checklist', () => {
    const task = makeTask();
    const diff = `--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1 +1,2 @@\n+export function login() {}`;

    const prompt = buildCriticPrompt(task, diff);

    expect(prompt).toContain('Implement JWT-based login endpoint.');
    expect(prompt).toContain(diff);
    expect(prompt).toContain('T1: Add login feature');
    expect(prompt).toContain('correctness');
    expect(prompt).toContain('scope');
    expect(prompt).toContain('APPROVED or REJECTED');
  });
});
