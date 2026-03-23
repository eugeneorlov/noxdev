#!/usr/bin/env bash
# docker-run-max.sh — Run Claude Code in Docker using Max subscription (~/.claude.json)
#
# Usage:
#   docker-run-max.sh <prompt_file> <task_log> <timeout_seconds> <worktree_dir> \
#     <project_git_dir> <git_target_path> <memory_limit> <cpu_limit> <docker_image>
#
# Arguments:
#   $1  prompt_file      Path to the prompt markdown file
#   $2  task_log          Path to write task output log
#   $3  timeout_seconds   Max execution time in seconds
#   $4  worktree_dir      Path to the git worktree to mount as /workspace
#   $5  project_git_dir   Path to the project .git directory (unused, reserved)
#   $6  git_target_path   Target path for git operations (unused, reserved)
#   $7  memory_limit      Docker memory limit (e.g., 2g)
#   $8  cpu_limit          Docker CPU limit (e.g., 2)
#   $9  docker_image      Docker image to use

set -euo pipefail

if [ "$#" -ne 9 ]; then
  echo "Error: expected 9 arguments, got $#" >&2
  echo "Usage: docker-run-max.sh <prompt_file> <task_log> <timeout_seconds> <worktree_dir> <project_git_dir> <git_target_path> <memory_limit> <cpu_limit> <docker_image>" >&2
  exit 1
fi

prompt_file="$1"
task_log="$2"
timeout_seconds="$3"
worktree_dir="$4"
project_git_dir="$5"  # reserved
git_target_path="$6"  # reserved
memory_limit="$7"
cpu_limit="$8"
docker_image="$9"

# Backup .claude.json from host
cp ~/.claude.json /tmp/.claude.json.bak

docker run --rm \
  --memory="$memory_limit" \
  --cpus="$cpu_limit" \
  -v "$worktree_dir":/workspace \
  -v "$project_git_dir":/project-git:ro \
  -v "$prompt_file":/tmp/prompt.md:ro \
  -v /tmp/.claude.json.bak:/root/.claude.json \
  --workdir /workspace \
  "$docker_image" \
  bash -c '
    git config --global user.email "noxdev@local"
    git config --global user.name "noxdev"
    git config --global safe.directory /workspace
    git config --global safe.directory /project-git
    echo "gitdir: /project-git/worktrees/'"$(basename "$worktree_dir")"'" > /workspace/.git
    timeout '"$timeout_seconds"' claude --print --verbose --output-format stream-json \
      -p "$(cat /tmp/prompt.md)" \
      --model claude-sonnet-4-20250514 \
      --max-turns 30 \
      --allowedTools "Bash(git*),Bash(npm*),Bash(pnpm*),Bash(node*),Bash(cat*),Bash(ls*),Bash(find*),Bash(grep*),Bash(sed*),Bash(mkdir*),Bash(cp*),Bash(mv*),Bash(rm*),Bash(echo*),Bash(touch*),Bash(head*),Bash(tail*),Read,Write,Edit"
  ' > "$task_log" 2>&1
