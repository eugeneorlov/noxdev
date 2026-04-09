FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    git \
    sudo \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# Claude Code CLI via npm (works in non-interactive Docker builds)
RUN npm install -g @anthropic-ai/claude-code

# Non-root user (unused at runtime — host UID/GID + HOME=/tmp override via --user flag)
# Kept for standalone `docker run noxdev-runner` debugging without --user flag
RUN useradd -m -s /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER runner
WORKDIR /workspace
ENV HOME=/home/runner
