import { readFileSync } from 'node:fs';

export interface ParsedTask {
  taskId: string;
  title: string;
  status: string;
  files: string[];
  verify: string;
  critic: string;
  spec: string;
}

const TASK_HEADER_RE = /^## (T\d+): (.+)$/;
const FIELD_RE = /^- (STATUS|FILES|VERIFY|CRITIC|SPEC): (.+)$/i;

export function parseTasks(
  content: string,
  includeDone = false,
): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  let current: ParsedTask | null = null;
  let inSpec = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headerMatch = line.match(TASK_HEADER_RE);
    if (headerMatch) {
      if (current) tasks.push(current);
      current = {
        taskId: headerMatch[1],
        title: headerMatch[2],
        status: 'pending',
        files: [],
        verify: '',
        critic: 'review',
        spec: '',
      };
      inSpec = false;
      continue;
    }

    if (!current) continue;

    // If we're inside a multi-line SPEC, check for continuation
    if (inSpec) {
      // Continuation line: starts with 2+ spaces of indentation
      if (/^ {2,}/.test(line)) {
        current.spec += '\n' + line.trim();
        continue;
      }
      // Not a continuation — stop collecting spec
      inSpec = false;
    }

    const fieldMatch = line.match(FIELD_RE);
    if (fieldMatch) {
      const name = fieldMatch[1].toUpperCase();
      const value = fieldMatch[2];

      switch (name) {
        case 'STATUS':
          current.status = value.trim().toLowerCase();
          break;
        case 'FILES':
          current.files = value
            .split(',')
            .map((f) => f.trim())
            .filter((f) => f.length > 0);
          break;
        case 'VERIFY':
          current.verify = value.trim();
          break;
        case 'CRITIC':
          current.critic = value.trim();
          break;
        case 'SPEC':
          current.spec = value.trimEnd();
          inSpec = true;
          break;
      }
    }
  }

  if (current) tasks.push(current);

  if (includeDone) return tasks;
  return tasks.filter((t) => t.status === 'pending');
}

export function parseTasksFromFile(
  filePath: string,
  includeDone = false,
): ParsedTask[] {
  const content = readFileSync(filePath, 'utf-8');
  return parseTasks(content, includeDone);
}
