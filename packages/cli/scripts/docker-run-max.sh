#!/usr/bin/env bash
# docker-run-max.sh — Run Claude Code in Docker using Max subscription (~/.claude.json)
#
# Usage:
#   docker-run-max.sh <prompt_file> <task_log> <timeout_seconds> <worktree_dir> \
#     <project_git_dir> <git_target_path> <memory_limit> <cpu_limit> <docker_image> \
#     <task_log_dir> [model]
#
# Arguments:
#   $1   prompt_file       Path to the prompt markdown file
#   $2   task_log          Path to write task output log (host-side redirect)
#   $3   timeout_seconds   Max execution time in seconds
#   $4   worktree_dir      Path to the git worktree to mount as /workspace
#   $5   project_git_dir   Path to the project .git directory (unused, reserved)
#   $6   git_target_path   Target path for git operations (unused, reserved)
#   $7   memory_limit      Docker memory limit (e.g., 2g)
#   $8   cpu_limit         Docker CPU limit (e.g., 2)
#   $9   docker_image      Docker image to use
#   $10  task_log_dir      Host dir mounted at the same path so the model can write
#                          gap-analysis files at the absolute path baked into prompts
#   $11  model             Claude model to use (default: sonnet)

set -euo pipefail

# Credential restore - restore from snapshot if it exists
CRED_SNAPSHOT="$HOME/.noxdev/.claude-snapshot.json"
if [ -f "$CRED_SNAPSHOT" ]; then
  cp "$CRED_SNAPSHOT" "$HOME/.claude.json"
fi

if [ "$#" -ne 10 ] && [ "$#" -ne 11 ]; then
  echo "Error: expected 10 or 11 arguments, got $#" >&2
  echo "Usage: docker-run-max.sh <prompt_file> <task_log> <timeout_seconds> <worktree_dir> <project_git_dir> <git_target_path> <memory_limit> <cpu_limit> <docker_image> <task_log_dir> [model]" >&2
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
task_log_dir="${10}"
model="${11:-sonnet}"

HOST_UID=$(id -u)
HOST_GID=$(id -g)

# Mount the host's global git identity (read-only) so commits use the user's
# real name/email instead of overriding the repo's local config.
gitconfig_mount=()
if [ -f "$HOME/.gitconfig" ]; then
    gitconfig_mount=(-v "$HOME/.gitconfig":/tmp/.gitconfig:ro)
fi

# Resolve a timeout binary. Linux has GNU `timeout`; macOS ships `gtimeout`
# via coreutils (brew install coreutils). Without this the run aborts with 127.
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"
if [ -z "$TIMEOUT_BIN" ]; then
  echo "Error: no 'timeout' or 'gtimeout' found. Install GNU coreutils (brew install coreutils)." >&2
  exit 1
fi

# Headless Max authentication.
# On macOS the interactive login token lives in the Keychain, refresh-rotated and
# OS-locked, so it can't be used inside a Linux container. The supported headless/CI
# path is a long-lived OAuth token created once with `claude setup-token`, stored
# 0600 at ~/.noxdev/max-oauth-token, and passed to the container's claude as
# CLAUDE_CODE_OAUTH_TOKEN. It is exported (so it stays out of argv / `ps`) and is
# never printed. Falls back silently if the file is absent (e.g. Linux file-creds).
oauth_env=()
TOKEN_FILE="$HOME/.noxdev/max-oauth-token"
if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOKEN_FILE")"
  export CLAUDE_CODE_OAUTH_TOKEN
  oauth_env=(-e CLAUDE_CODE_OAUTH_TOKEN)
elif [ "$(uname)" = "Darwin" ]; then
  echo "Warning: no Max OAuth token at $TOKEN_FILE." >&2
  echo "         Create one: run 'claude setup-token' and save the token there (chmod 600)." >&2
fi

"$TIMEOUT_BIN" "$timeout_seconds" docker run --rm \
    --memory="$memory_limit" \
    --cpus="$cpu_limit" \
    -v "$worktree_dir":/workspace \
    -v "$project_git_dir":"$git_target_path" \
    -v "$task_log_dir":"$task_log_dir" \
    -v ~/.claude:/tmp/.claude \
    -v ~/.claude.json:/tmp/.claude.json \
    ${oauth_env[@]+"${oauth_env[@]}"} \
    "${gitconfig_mount[@]}" \
    -e HOME=/tmp \
    --user "$HOST_UID":"$HOST_GID" \
    -v "$prompt_file":/tmp/task-prompt.txt:ro \
    "$docker_image" \
    bash -c 'claude -p --dangerously-skip-permissions --model '"$model"' --effort high < /tmp/task-prompt.txt' \
    > "$task_log" 2>&1
