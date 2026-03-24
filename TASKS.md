# noxdev Fix: Projects pending count reads wrong path

## T1: Fix noxdev projects to read TASKS.md from worktree, not repo
- STATUS: done
- FILES: packages/cli/src/commands/projects.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js projects
- CRITIC: skip
- PUSH: auto
- SPEC: The `countPendingTasks` function in packages/cli/src/commands/projects.ts
  reads TASKS.md from `repo_path` (the main project directory). But TASKS.md
  lives in the worktree directory, not the repo directory.
  Fix: change the function to accept and use `worktree_path` instead of `repo_path`.
  Step 1: In the SQL query, add `p.worktree_path` to the SELECT:
  ```typescript
  SELECT p.id, p.display_name, p.repo_path, p.worktree_path,
  ```
  Step 2: Change the call from:
  ```typescript
  const pending = countPendingTasks(row.repo_path);
  ```
  to:
  ```typescript
  const pending = countPendingTasks(row.worktree_path);
  ```
  Do NOT change the countPendingTasks function itself — it already correctly
  joins the path with "TASKS.md" and reads the file. It just needs the right
  base path passed in.
  Do NOT change anything else in projects.ts.
