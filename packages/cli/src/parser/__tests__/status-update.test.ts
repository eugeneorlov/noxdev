import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateTaskStatus, updateAllTaskStatuses } from '../status-update.js';

const SAMPLE_TASKS = `# Project Tasks

## T1: First task
- STATUS: pending
- FILES: a.ts, b.ts
- VERIFY: pnpm build
- SPEC: Do the first thing.

## T2: Second task
- STATUS: pending
- FILES: c.ts
- VERIFY: pnpm test
- SPEC: Do the second thing.

## T3: Third task with multi-line SPEC
- STATUS: pending
- FILES: d.ts, e.ts
- VERIFY: pnpm build && pnpm test
- SPEC: This task has a multi-line spec.
  It continues here with more detail.
  And even more detail on this line.

## T4: Fourth task
- STATUS: done
- FILES: f.ts
- VERIFY: pnpm build
- SPEC: Already completed task.
`;

let tmpFile: string;

beforeEach(() => {
  tmpFile = join(tmpdir(), `status-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(tmpFile, SAMPLE_TASKS, 'utf-8');
});

afterEach(() => {
  try {
    unlinkSync(tmpFile);
  } catch {
    // ignore cleanup errors
  }
});

describe('updateTaskStatus', () => {
  it('updates a single task status from pending to done', () => {
    updateTaskStatus(tmpFile, 'T1', 'done');
    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('## T1: First task\n- STATUS: done');
  });

  it('does not change other tasks when updating one', () => {
    updateTaskStatus(tmpFile, 'T1', 'done');
    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('## T2: Second task\n- STATUS: pending');
    expect(content).toContain('## T3: Third task with multi-line SPEC\n- STATUS: pending');
    expect(content).toContain('## T4: Fourth task\n- STATUS: done');
  });

  it('does not corrupt multi-line SPEC when updating that task', () => {
    updateTaskStatus(tmpFile, 'T3', 'done');
    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('## T3: Third task with multi-line SPEC\n- STATUS: done');
    expect(content).toContain('  It continues here with more detail.');
    expect(content).toContain('  And even more detail on this line.');
  });

  it('throws for non-existent taskId', () => {
    expect(() => updateTaskStatus(tmpFile, 'T99', 'done')).toThrow(
      'Task T99 not found',
    );
    // File should be unchanged
    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toBe(SAMPLE_TASKS);
  });
});

describe('updateAllTaskStatuses', () => {
  it('batch updates multiple tasks in one pass', () => {
    updateAllTaskStatuses(tmpFile, [
      { taskId: 'T1', status: 'done' },
      { taskId: 'T2', status: 'failed' },
      { taskId: 'T3', status: 'skipped' },
    ]);
    const content = readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('## T1: First task\n- STATUS: done');
    expect(content).toContain('## T2: Second task\n- STATUS: failed');
    expect(content).toContain('## T3: Third task with multi-line SPEC\n- STATUS: skipped');
    // T4 unchanged
    expect(content).toContain('## T4: Fourth task\n- STATUS: done');
  });

  it('throws if any taskId in the batch is not found', () => {
    expect(() =>
      updateAllTaskStatuses(tmpFile, [
        { taskId: 'T1', status: 'done' },
        { taskId: 'T99', status: 'done' },
      ]),
    ).toThrow('Task T99 not found');
  });
});
