#!/usr/bin/env bash
# docker-capture-diff.sh — Capture full git diff (staged, unstaged, untracked) from a worktree
#
# Usage:
#   docker-capture-diff.sh <worktree_dir> <output_file> <pre_task_sha>
#
# Arguments:
#   $1  worktree_dir  Path to the git worktree
#   $2  output_file   Path to write the combined diff output
#   $3  pre_task_sha  Git SHA of HEAD before the task's agent ran
#
# Output format:
#   - Unstaged changes (git diff HEAD)
#   - "---STAGED---" separator
#   - Staged changes (git diff --cached)
#   - "---UNTRACKED---" separator
#   - Contents of each untracked file prefixed with "=== <filename> ==="
#
# Exits 0 even if there are no changes (empty diff is valid).

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Error: expected 3 arguments, got $#" >&2
  echo "Usage: docker-capture-diff.sh <worktree_dir> <output_file> <pre_task_sha>" >&2
  exit 1
fi

worktree_dir="$1"
output_file="$2"
pre_task_sha="$3"

cd "$worktree_dir"

# Defensive excludes: even if the project's .gitignore is missing common build-artifact
# patterns, never let dependency stores or build outputs leak into the diff. Otherwise
# the prompt embedding the diff explodes (e.g. .pnpm-store can be hundreds of MB).
EXCLUDES=(
  ":(exclude,glob)**/node_modules/**"
  ":(exclude,glob)**/.pnpm-store/**"
  ":(exclude,glob)**/.next/**"
  ":(exclude,glob)**/dist/**"
  ":(exclude,glob)**/build/**"
  ":(exclude,glob)**/.turbo/**"
  ":(exclude,glob)**/coverage/**"
  ":(exclude,glob)**/.cache/**"
)

LSFILES_EXCLUDES=(
  --exclude=node_modules
  --exclude=.pnpm-store
  --exclude=.next
  --exclude=dist
  --exclude=build
  --exclude=.turbo
  --exclude=coverage
  --exclude=.cache
)

# Stage untracked files as intent-to-add so they appear in git diff, but skip the
# excluded paths so we don't pull artifact stores into the patch.
while IFS= read -r f; do
  [ -n "$f" ] && git add -N -- "$f" 2>/dev/null || true
done < <(git ls-files --others --exclude-standard "${LSFILES_EXCLUDES[@]}")

{
echo "---COMMITTED---"
# Diff from pre-task baseline to current HEAD — this is the agent's committed work.
# If pre_task_sha == HEAD (agent committed nothing), this diff is empty.
if [ "$pre_task_sha" != "$(git rev-parse HEAD)" ]; then
git diff "$pre_task_sha..HEAD" -- . "${EXCLUDES[@]}" || true
fi
echo "---UNCOMMITTED---"
# Any uncommitted work the agent left in the worktree (rare but possible).
git diff HEAD -- . "${EXCLUDES[@]}" || true
echo "---STAGED---"
git diff --cached -- . "${EXCLUDES[@]}" || true
echo "---UNTRACKED---"
git ls-files --others --exclude-standard "${LSFILES_EXCLUDES[@]}" | while IFS= read -r f; do
echo "=== $f ==="
cat "$f" 2>/dev/null || true
done
} > "$output_file"

# Unstage intent-to-add files to restore working directory state
git reset HEAD . 2>/dev/null || true

exit 0
