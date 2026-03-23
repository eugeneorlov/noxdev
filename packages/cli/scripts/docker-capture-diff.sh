#!/usr/bin/env bash
# docker-capture-diff.sh — Capture full git diff (staged, unstaged, untracked) from a worktree
#
# Usage:
#   docker-capture-diff.sh <worktree_dir> <output_file>
#
# Arguments:
#   $1  worktree_dir  Path to the git worktree
#   $2  output_file   Path to write the combined diff output
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

if [ "$#" -ne 2 ]; then
  echo "Error: expected 2 arguments, got $#" >&2
  echo "Usage: docker-capture-diff.sh <worktree_dir> <output_file>" >&2
  exit 1
fi

worktree_dir="$1"
output_file="$2"

cd "$worktree_dir"

{
  git diff HEAD || true
  echo "---STAGED---"
  git diff --cached || true
  echo "---UNTRACKED---"
  git ls-files --others --exclude-standard | while IFS= read -r f; do
    echo "=== $f ==="
    cat "$f" 2>/dev/null || true
  done
} > "$output_file"

exit 0
