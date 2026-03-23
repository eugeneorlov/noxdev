import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseTasks, parseTasksFromFile } from '../tasks.js';

describe('parseTasks', () => {
  it('parses a single task with all fields', () => {
    const content = `## T1: My task
- STATUS: pending
- FILES: src/a.ts, src/b.ts
- VERIFY: pnpm build
- CRITIC: review
- PUSH: gate
- SPEC: Do the thing.`;

    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.taskId).toBe('T1');
    expect(t.title).toBe('My task');
    expect(t.status).toBe('pending');
    expect(t.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(t.verify).toBe('pnpm build');
    expect(t.critic).toBe('review');
    expect(t.push).toBe('gate');
    expect(t.spec).toBe('Do the thing.');
  });

  it('parses multi-line SPEC', () => {
    const content = `## T1: Multi spec
- STATUS: pending
- SPEC: Line one.
  Line two.
  Line three.
- VERIFY: pnpm test`;

    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].spec).toBe('Line one.\nLine two.\nLine three.');
    expect(tasks[0].verify).toBe('pnpm test');
  });

  it('parses multiple tasks', () => {
    const content = `## T1: First task
- STATUS: pending
- SPEC: First spec.

## T2: Second task
- STATUS: pending
- SPEC: Second spec.

## T3: Third task
- STATUS: done
- SPEC: Third spec.`;

    const tasks = parseTasks(content, true);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].taskId).toBe('T1');
    expect(tasks[0].spec).toBe('First spec.');
    expect(tasks[1].taskId).toBe('T2');
    expect(tasks[1].spec).toBe('Second spec.');
    expect(tasks[2].taskId).toBe('T3');
    expect(tasks[2].status).toBe('done');
  });

  it('filters by status — only pending by default', () => {
    const content = `## T1: Done task
- STATUS: done
- SPEC: Done.

## T2: Pending task
- STATUS: pending
- SPEC: Pending.

## T3: Failed task
- STATUS: failed
- SPEC: Failed.`;

    const pendingOnly = parseTasks(content);
    expect(pendingOnly).toHaveLength(1);
    expect(pendingOnly[0].taskId).toBe('T2');

    const all = parseTasks(content, true);
    expect(all).toHaveLength(3);
  });

  it('applies defaults for missing optional fields', () => {
    const content = `## T1: Minimal task
- STATUS: pending`;

    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.files).toEqual([]);
    expect(t.verify).toBe('');
    expect(t.critic).toBe('review');
    expect(t.push).toBe('auto');
    expect(t.spec).toBe('');
  });

  it('returns empty array for empty input', () => {
    expect(parseTasks('')).toEqual([]);
    expect(parseTasks('# Some heading\nRandom text')).toEqual([]);
  });

  it('splits FILES by comma and trims whitespace', () => {
    const content = `## T1: Files test
- STATUS: pending
- FILES: a.ts, b.ts, c.ts`;

    const tasks = parseTasks(content);
    expect(tasks[0].files).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});

describe('parseTasksFromFile', () => {
  const tmpFile = join(tmpdir(), `noxdev-tasks-test-${Date.now()}.md`);

  afterEach(() => {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  });

  it('reads and parses from a file path', () => {
    const content = `## T1: File task
- STATUS: pending
- FILES: x.ts
- VERIFY: pnpm build
- SPEC: From file.`;

    writeFileSync(tmpFile, content);
    const tasks = parseTasksFromFile(tmpFile);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskId).toBe('T1');
    expect(tasks[0].spec).toBe('From file.');
  });
});
