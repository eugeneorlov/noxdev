import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRoot: string | null = null;

export function findCliRoot(): string {
  if (cachedRoot) return cachedRoot;
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  while (dir !== '/' && dir !== '.') {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === '@eugene218/noxdev' || pkg.name === 'noxdev') {
          cachedRoot = dir;
          return dir;
        }
      } catch { /* keep walking */ }
    }
    dir = path.dirname(dir);
  }
  throw new Error(`Could not find noxdev CLI package root walking up from ${here}`);
}

export function dockerfilePath(): string {
  return path.join(findCliRoot(), 'docker', 'Dockerfile');
}

export function demoTasksPath(): string {
  return path.join(findCliRoot(), 'templates', 'demo-tasks.md');
}
