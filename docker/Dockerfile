FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    git \
    sudo \
    ca-certificates \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Symlink python → python3 so task specs calling `python` work
RUN ln -sf /usr/bin/python3 /usr/bin/python

# uv — fast Python package manager, sidesteps PEP 668, creates venvs
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv \
    && chmod 755 /usr/local/bin/uv

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
