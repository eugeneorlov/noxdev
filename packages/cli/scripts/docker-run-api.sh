#!/usr/bin/env bash
# docker-run-api.sh — Run Claude Code in Docker using API key authentication
#
# Usage:
#   docker-run-api.sh <prompt_file> <task_log> <timeout_seconds> <worktree_dir> \
#     <project_git_dir> <git_target_path> <memory_limit> <cpu_limit> <docker_image> <api_key>
#
# Arguments:
#   $1   prompt_file      Path to the prompt markdown file
#   $2   task_log          Path to write task output log
#   $3   timeout_seconds   Max execution time in seconds
#   $4   worktree_dir      Path to the git worktree to mount as /workspace
#   $5   project_git_dir   Path to the project .git directory (unused, reserved)
#   $6   git_target_path   Target path for git operations (unused, reserved)
#   $7   memory_limit      Docker memory limit (e.g., 2g)
#   $8   cpu_limit          Docker CPU limit (e.g., 2)
#   $9   docker_image      Docker image to use
#   $10  api_key           Anthropic API key

set -euo pipefail

if [ "$#" -ne 10 ]; then
  echo "Error: expected 10 arguments, got $#" >&2
  echo "Usage: docker-run-api.sh <prompt_file> <task_log> <timeout_seconds> <worktree_dir> <project_git_dir> <git_target_path> <memory_limit> <cpu_limit> <docker_image> <api_key>" >&2
  exit 1
fi

prompt_file="$1"
task_log="$2"
timeout_seconds="$3"
worktree_dir="$4"
project_git_dir="$5"
git_target_path="$6"
memory_limit="$7"
cpu_limit="$8"
docker_image="$9"
api_key="${10}"

HOST_UID=$(id -u)
HOST_GID=$(id -g)

timeout "$timeout_seconds" docker run --rm \
    --memory="$memory_limit" \
    --cpus="$cpu_limit" \
    -v "$worktree_dir":/workspace \
    -v "$project_git_dir":"$git_target_path" \
    -v "$prompt_file":/tmp/task-prompt.txt:ro \
    -e ANTHROPIC_API_KEY="$api_key" \
    -e HOME=/tmp \
    --user "$HOST_UID":"$HOST_GID" \
    "$docker_image" \
    bash -c 'git config user.name "noxdev" && git config user.email "noxdev@local" && claude -p "$(cat /tmp/task-prompt.txt)" --dangerously-skip-permissions --model claude-sonnet-4-20250514 --effort high' \
    > "$task_log" 2>&1
