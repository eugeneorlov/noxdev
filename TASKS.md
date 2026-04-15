# v1.3.2 — honest doctor, working dashboard, working cost tracking

# Scope: Three audit-driven fix bundles plus README + version cuts.
#   1. Doctor: stop lying about Docker fallbacks for host-side tools
#   2. Demo: validate host prereqs at start instead of mid-scaffold crash
#   3. Dashboard: fix tsup node: prefix strip (same root cause as v1.3.1 CLI fix)
#   4. Cost tracking: fix path encoding mismatch + missing API-mode volume mount
#   5. README: list uv as required
#   6. CHANGELOG + version bump
#
# Source audits (read these into Project before planning the next round):
#   .audits/audit-doctor-reassurances-2026-04-15.md
#   .audits/audit-cost-tracking-2026-04-15.md
#
# Dependencies: clean main at v1.3.1
# Gate: pnpm build && pnpm test pass; doctor honest; demo fails-fast on missing prereq;
#       noxdev dashboard runs without ERR_MODULE_NOT_FOUND; noxdev cost shows real data
#       after at least one new run completes.
#
# CRITIC: skip on all tasks. Verification done via post-run audit comparing actual diffs
# against this TASKS.md, not via critic agent (per recurring critic-reliability issue).

## T1: noxdev doctor — honest messages for uv and python3
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: cd packages/cli && pnpm build && ! grep -q "available in Docker" src/commands/doctor.ts && ! grep -q "not required for noxdev" src/commands/doctor.ts && grep -q "noxdev demo" src/commands/doctor.ts && grep -q "astral.sh/uv/install.sh" src/commands/doctor.ts
- CRITIC: skip
- SPEC:
  Doctor currently tells users that missing uv and python3 are "not required
  for noxdev - available in Docker". This is false — both are invoked on the
  HOST by noxdev demo:
    - demo.ts:298 calls execSync('uv sync', { cwd: ... }) on host
    - demo.ts:167 generates an npm script "dev:backend" that runs uv run uvicorn on host
    - python3 is required by uv run on host

  The "available in Docker" reassurance was written when noxdev was 100%
  Docker-based and never updated as host-side features grew.

  In packages/cli/src/commands/doctor.ts find the python3 check (around line
  158-165) and the uv check (around line 168-175). Replace their failure
  messages with honest, actionable ones. Both must REMAIN non-fatal warnings
  (yellow, critical: false) — a user not running noxdev demo can still run
  noxdev. They just need to know the truth about what's missing and why.

  python3 failure message — platform-specific install hint:
    message: "python3 not found on host (required for `noxdev demo` FastAPI scaffold)"
    hint on darwin:  "Install: brew install python3"
    hint elsewhere:  "Install: apt install python3   # or your distro equivalent"

  uv failure message — universal install command (works Mac and Linux):
    message: "uv not found on host (required for `noxdev demo` and Python project workflows)"
    hint:    "Install: curl -LsSf https://astral.sh/uv/install.sh | sh"

  Use process.platform === 'darwin' to switch the python3 hint.

  Do NOT change pass-state messages. Do NOT touch any other doctor checks.
  Do NOT change the pass-count / total-count math.

## T2: noxdev doctor — add age check, tighten SOPS message
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "age --version" src/commands/doctor.ts && grep -qE "(API key|api fallback|sops -d)" src/commands/doctor.ts
- CRITIC: skip
- SPEC:
  Two findings from the doctor audit (.audits/audit-doctor-reassurances-2026-04-15.md):

  RISK 4 — age is the default secrets provider (config/index.ts:24:
  provider: "age") but doctor.ts has no check for it. setup.ts:232 checks for
  age and warns if missing, but a user running noxdev doctor after a manual
  install (skipping noxdev setup) would not be warned.

  RISK 3 — SOPS check at doctor.ts:148-155 is non-critical with terse message
  "SOPS not found. Secrets encryption unavailable." This does not convey that
  SOPS is needed for the API fallback code path (auth/index.ts:39 calls
  sops -d to decrypt the API key when Max credentials are unavailable).

  Step 1 — Add an age check immediately after the SOPS check. Same pattern
  as the existing tool checks. Yellow warn (critical: false). Failure
  message:
    message: "age not found on host (required for SOPS-based secrets encryption)"
    hint:    "Install: see https://github.com/FiloSottile/age#installation"

  Use the same try/catch + execSync('age --version', { stdio: 'pipe' })
  pattern as the existing checks.

  Step 2 — Tighten the SOPS check failure message:
    message: "SOPS not found on host (required for API key decryption when api fallback is enabled)"
    hint:    "Install: see https://github.com/getsops/sops#download"

  Both checks remain non-critical (critical: false / yellow warn) — users
  not using API fallback don't strictly need either tool.

  Do NOT change the SOPS check structure or position. Do NOT add age to any
  other code path. Do NOT touch python3 or uv checks (covered by T1).

## T3: noxdev demo validates uv and python3 at start with clear error
- STATUS: done
- FILES: packages/cli/src/commands/demo.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "uv --version" src/commands/demo.ts && grep -q "python3 --version" src/commands/demo.ts && grep -q "astral.sh/uv/install.sh" src/commands/demo.ts
- CRITIC: skip
- SPEC:
  noxdev demo currently fails partway through scaffolding with a uv-related
  error if uv is not installed on the host. This wastes time and leaves a
  half-scaffolded project on disk.

  In packages/cli/src/commands/demo.ts add a prerequisite check at the very
  start of the demo command function, BEFORE any scaffolding work begins.
  Place it as the first thing the function does after argument parsing.

  uv check (universal install command — works Mac and Linux):
  ```ts
  try {
    const version = execSync('uv --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    console.log(chalk.green(`✓ ${version}`));
  } catch {
    console.error(chalk.red('✖ uv not found.'));
    console.error(chalk.gray('  noxdev demo requires uv for Python project scaffolding.'));
    console.error(chalk.gray('  Install: curl -LsSf https://astral.sh/uv/install.sh | sh'));
    process.exit(1);
  }
  ```

  python3 check (platform-specific install hint):
  ```ts
  try {
    const version = execSync('python3 --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    console.log(chalk.green(`✓ ${version}`));
  } catch {
    console.error(chalk.red('✖ python3 not found.'));
    console.error(chalk.gray('  noxdev demo requires Python 3 for the FastAPI scaffold.'));
    const installCmd = process.platform === 'darwin'
      ? 'brew install python3'
      : 'apt install python3   # or your distro equivalent';
    console.error(chalk.gray(`  Install: ${installCmd}`));
    process.exit(1);
  }
  ```

  Make sure execSync is imported from 'node:child_process' if not already.
  Make sure chalk is imported if not already.

  Do NOT modify the rest of the demo logic. Do NOT change Docker checks
  (separate concern — those are for the agent runtime).

## T4: dashboard tsup config — preserve node: prefix
- STATUS: done
- FILES: packages/dashboard/tsup.config.ts, packages/dashboard/package.json
- VERIFY: cd packages/dashboard && pnpm build && grep -q "node:sqlite" dist/api/server.js && ! grep -qE "from ['\"]sqlite['\"]" dist/api/server.js
- CRITIC: skip
- SPEC:
  noxdev dashboard fails at runtime with:
    Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sqlite' imported from
      .../dist/dashboard/api/server.js

  Same root cause as v1.3.1's CLI fix: tsup v8 defaults removeNodeProtocol
  to true, which strips the `node:` prefix from
  `import { DatabaseSync } from 'node:sqlite'` during the dashboard API
  build, leaving `from 'sqlite'` which Node cannot resolve (no such package
  exists; node:sqlite is a Node built-in addressed only via the prefix).

  v1.3.1 fixed this in packages/cli/tsup.config.ts but the dashboard has its
  own tsup invocation (originally per Phase D T1 spec:
    "build:api": "tsup src/api/server.ts --format esm --target node18 --outDir dist/api"
  ) which never received the fix.

  Step 1 — Create packages/dashboard/tsup.config.ts (or update if it exists):
  ```ts
  import { defineConfig } from 'tsup';

  export default defineConfig({
    entry: ['src/api/server.ts'],
    format: ['esm'],
    target: 'node24',
    outDir: 'dist/api',
    removeNodeProtocol: false,
    clean: false,
  });
  ```

  Note target bumped from node18 → node24 to match the v1.3.0 minimum-Node
  bump. node:sqlite needs Node 22+ anyway.

  Step 2 — Update packages/dashboard/package.json build:api script to use
  the config file instead of inline flags:
    "build:api": "tsup --config tsup.config.ts"
  Remove the inline --format / --target / --outDir flags since they're now
  in the config file.

  Do NOT touch the frontend Vite build (the React app build script).
  Do NOT change anything in packages/cli/.

## T5: cost tracking — fix path encoding in findLatestSessionFile
- STATUS: done
- FILES: packages/cli/src/cost/parser.ts, packages/cli/src/engine/orchestrator.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "/workspace" src/cost/parser.ts && grep -q "findLatestSessionFile" src/engine/orchestrator.ts && ! grep -q "findLatestSessionFile(worktreeDir" src/engine/orchestrator.ts
- CRITIC: skip
- SPEC:
  Per .audits/audit-cost-tracking-2026-04-15.md RISK 3 (the root cause of
  "noxdev cost — No cost data found"):

  findLatestSessionFile in packages/cli/src/cost/parser.ts (around line 62)
  is called from the host with the host worktree path
  (e.g. /home/eugene218/projects/foo-worktree). It encodes that as
  -home-eugene218-projects-foo-worktree and looks in
  ~/.claude/projects/-home-eugene218-projects-foo-worktree/

  But inside the Docker container (per docker-run-max.sh line 49):
    - worktree is mounted at /workspace (-v "$worktree_dir":/workspace)
    - HOME=/tmp
    - Claude Code's CWD is /workspace
    - Claude Code encodes the project dir as "-workspace"
    - Session files written at /tmp/.claude/projects/-workspace/*.jsonl
    - Via volume mount these land on host at ~/.claude/projects/-workspace/

  The host lookup never matches the container-encoded path. Lookup always
  returns null. captureTaskCost always returns the all-zero/null struct.
  Every task_results row has model = NULL. The downstream
  `AND tr.model IS NOT NULL` filter in cost.ts then excludes everything.

  Fix:

  Step 1 — In packages/cli/src/cost/parser.ts, change findLatestSessionFile
  signature to NOT take worktreePath. Instead use a hardcoded constant for
  the container CWD:

  ```ts
  // Container CWD as mounted by docker-run-{max,api}.sh
  // Claude Code encodes this as the project directory key.
  const CONTAINER_WORKSPACE = '/workspace';

  export function findLatestSessionFile(afterTimestamp: number): string | null {
    const projectKey = CONTAINER_WORKSPACE.replaceAll('/', '-'); // "-workspace"
    const projectsDir = path.join(os.homedir(), '.claude', 'projects', projectKey);
    if (!fs.existsSync(projectsDir)) return null;

    const files = fs.readdirSync(projectsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const full = path.join(projectsDir, f);
        return { full, mtimeMs: fs.statSync(full).mtimeMs };
      })
      .filter(f => f.mtimeMs >= afterTimestamp)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return files.length > 0 ? files[0].full : null;
  }
  ```

  Preserve the existing imports (fs, path, os) — they should already be there.
  Preserve the existing parseSessionUsage function unchanged.

  Step 2 — In packages/cli/src/engine/orchestrator.ts find the call site
  (around line 29-68 inside captureTaskCost) and update the call:

  Before:
    const sessionFile = findLatestSessionFile(worktreeDir, containerStartMs);

  After:
    const sessionFile = findLatestSessionFile(containerStartMs);

  Remove the worktreeDir argument (it was the bug source). The function no
  longer accepts a path arg.

  Known limitation to document in the CHANGELOG (T8): if two parallel noxdev
  runs from different terminal windows start within the same millisecond and
  write to the same -workspace project key, cost attribution between them
  could cross. The mtime + containerStartMs filter handles non-simultaneous
  parallel runs correctly. Genuine sub-millisecond simultaneity is rare
  enough to be future work.

  Do NOT modify pricing.ts. Do NOT modify the schema or queries.ts.
  Do NOT touch the `model IS NOT NULL` filter in cost.ts — that filter is
  correct in intent (excluding pre-v1.2.0 rows) and will work as designed
  once model is no longer always null.

## T6: cost tracking — add ~/.claude mount to docker-run-api.sh
- STATUS: done
- FILES: packages/cli/scripts/docker-run-api.sh
- VERIFY: grep -E "^\s*-v.*\.claude" packages/cli/scripts/docker-run-api.sh
- CRITIC: skip
- SPEC:
  Per .audits/audit-cost-tracking-2026-04-15.md RISK 2 (high severity):

  docker-run-max.sh line 51 mounts host ~/.claude into the container so
  Claude Code's session logs survive container removal:
    -v ~/.claude:/tmp/.claude

  docker-run-api.sh has NO equivalent mount. API-mode runs write session
  logs inside the container only, then `docker run --rm` destroys them.
  Cost data is impossible to capture for API-mode runs without this mount.

  Fix: in packages/cli/scripts/docker-run-api.sh, add the same
  -v ~/.claude:/tmp/.claude line that docker-run-max.sh has. Place it
  next to the other volume mount lines (around the same position as in
  docker-run-max.sh — typically right after the worktree mount).

  Use the same exact form as docker-run-max.sh — including the path quoting
  style used in that file. Match the conventions of the existing script.

  Do NOT change any other line in docker-run-api.sh. Do NOT add the mount
  anywhere else. Do NOT touch docker-run-max.sh.

## T7: README — add uv as required, version bump
- STATUS: done
- FILES: README.md, packages/cli/README.md
- VERIFY: grep -q "uv" README.md && grep -q "uv" packages/cli/README.md && grep -q "astral.sh/uv/install.sh" README.md
- CRITIC: skip
- SPEC:
  Add uv to the Requirements section of both READMEs.

  In README.md and packages/cli/README.md Requirements section, add this
  bullet, placed after the Claude Code CLI line and before SOPS + age:

  ```markdown
  - uv (required for `noxdev demo` and Python project workflows)
    - Install: `curl -LsSf https://astral.sh/uv/install.sh | sh` (works on Mac and Linux)
  ```

  In README.md only, also update any version badge or version reference
  from 1.3.1 (whichever it currently shows) to 1.3.2.

  Do NOT touch any other README sections.

## T8: CHANGELOG entry for v1.3.2 + version bumps
- STATUS: done
- FILES: CHANGELOG.md, packages/cli/package.json, packages/dashboard/package.json
- VERIFY: grep -q "## \[1.3.2\]" CHANGELOG.md && grep -q '"version": "1.3.2"' packages/cli/package.json && grep -q '"version": "1.3.2"' packages/dashboard/package.json
- CRITIC: skip
- SPEC:
  Add a CHANGELOG entry above [1.3.1] and bump version strings in both
  package.json files.

  In CHANGELOG.md, add this new section above [1.3.1]:

  ```markdown
  ## [1.3.2] - 2026-04-15

  ### Fixed
  - `noxdev cost` now actually returns cost data. Path encoding mismatch in
    the session file lookup (host path vs container `/workspace` path) caused
    every task to write `model = NULL` and zero cost data. The downstream
    `model IS NOT NULL` filter then excluded everything, returning "No cost
    data found" on every invocation since v1.2.0 shipped. Fixed by encoding
    from the container workspace constant instead of the host worktree path.
  - `docker-run-api.sh` now mounts `~/.claude` into the container, matching
    `docker-run-max.sh`. Without this mount, API-mode runs could not capture
    session logs at all (container ephemerality), making cost data
    impossible regardless of any other fix.
  - `noxdev dashboard` no longer crashes with `ERR_MODULE_NOT_FOUND` for
    `sqlite` on startup. The dashboard's tsup build config was missing the
    `removeNodeProtocol: false` setting that v1.3.1 added to the CLI build,
    causing the same `node:` prefix stripping bug in the dashboard API
    bundle.
  - `noxdev doctor` no longer falsely reassures users that missing host
    tools (uv, python3) are "available in Docker". They aren't — `noxdev
    demo` runs both on the host. Doctor now states what each tool is needed
    for and gives platform-specific install commands.
  - `noxdev doctor` SOPS message now explains it's needed for API key
    decryption when api fallback is enabled (was previously a terse
    "encryption unavailable").
  - `noxdev demo` now validates uv and Python3 are installed on the host
    before starting any scaffolding. Previously failed mid-scaffold with a
    confusing error.

  ### Added
  - `noxdev doctor` now checks for `age` (the default secrets provider).
    Previously only `setup.ts` warned about it; users running `doctor` after
    a manual install would not be warned.

  ### Documentation
  - README and packages/cli/README now list `uv` as a required dependency
    with the universal cross-platform install command.

  ### Known limitations
  - Cost tracking still uses a single `-workspace` project key shared by all
    noxdev runs on the host. The mtime + containerStartMs filter handles
    non-simultaneous parallel runs correctly, but two runs starting in the
    same millisecond from different terminals could cross-attribute costs.
    Sub-millisecond simultaneity is rare enough to be future work.
  ```

  Bump version in packages/cli/package.json: `"version": "1.3.2"`
  Bump version in packages/dashboard/package.json: `"version": "1.3.2"`

  Do NOT modify any earlier CHANGELOG entries.
