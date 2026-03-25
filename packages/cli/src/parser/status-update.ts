import { readFileSync, writeFileSync } from 'node:fs';

const TASK_HEADER_RE = /^## (T\d+): /;
const STATUS_LINE_RE = /^(- STATUS: )\w+/;

function replaceTaskStatus(
  content: string,
  taskId: string,
  newStatus: string,
): { content: string; found: boolean } {
  const lines = content.split('\n');
  let inTargetTask = false;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(TASK_HEADER_RE);
    if (headerMatch) {
      inTargetTask = headerMatch[1] === taskId;
      continue;
    }

    if (inTargetTask && STATUS_LINE_RE.test(lines[i])) {
      lines[i] = lines[i].replace(STATUS_LINE_RE, `$1${newStatus}`);
      found = true;
      break;
    }
  }

  return { content: lines.join('\n'), found };
}

export function updateTaskStatus(
  filePath: string,
  taskId: string,
  newStatus: string,
): void {
  const content = readFileSync(filePath, 'utf-8');
  const result = replaceTaskStatus(content, taskId, newStatus);
  if (!result.found) {
    throw new Error(`Task ${taskId} not found in ${filePath}`);
  }
  writeFileSync(filePath, result.content, 'utf-8');
}

export function updateAllTaskStatuses(
  filePath: string,
  results: Array<{ taskId: string; status: string }>,
): void {
  let content = readFileSync(filePath, 'utf-8');

  for (const { taskId, status } of results) {
    const result = replaceTaskStatus(content, taskId, status);
    if (!result.found) {
      throw new Error(`Task ${taskId} not found in ${filePath}`);
    }
    content = result.content;
  }

  writeFileSync(filePath, content, 'utf-8');
}
