# noxdev v1.0.3 — Polish & Diagnostics

# Dependencies: 1.0.2 published, manual fixes for demo auto-clean, remove branch
# cleanup, doctor tiered Node check, and engines bump already merged.
#
# Session 1: T1 (dumpErr helper + apply to demo.ts catch blocks)
# Session 2: T2 (postinstall script for better-sqlite3 detection)
# Session 3: T3 (Vite scaffold robustness — pin pnpm dlx form)
# Session 4: T4 (CHANGELOG + version bump to 1.0.3)

## T1: Add dumpErr helper and use it in every demo.ts catch block
- STATUS: failed
- FILES: packages/cli/src/lib/errors.ts, packages/cli/src/commands/demo.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js demo --help
- CRITIC: review
- PUSH: gate
- SPEC: Stop swallowing child_process errors in demo.ts. Every catch block must
  surface stderr and stdout from failed commands so users (and the maintainer)
  can see what actually went wrong.

  Step 1: Create packages/cli/src/lib/errors.ts with this exact content:

  ```typescript
  import chalk from 'chalk';

  /**
   * Print stderr and stdout from a child_process error to the console.
   * Use in catch blocks around execSync/spawnSync calls to surface real
   * error output instead of swallowing it.
   */
  export function dumpErr(err: unknown): void {
    if (!err || typeof err !== 'object') return;
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string };
    const stderrStr = e.stderr ? (Buffer.isBuffer(e.stderr) ? e.stderr.toString() : e.stderr) : '';
    const stdoutStr = e.stdout ? (Buffer.isBuffer(e.stdout) ? e.stdout.toString() : e.stdout) : '';
    if (stderrStr.trim().length > 0) {
      console.error(chalk.gray('  ─ stderr ─'));
      console.error(chalk.gray('  ' + stderrStr.trim().replace(/\n/g, '\n  ')));
    }
    if (stdoutStr.trim().length > 0) {
      console.error(chalk.gray('  ─ stdout ─'));
      console.error(chalk.gray('  ' + stdoutStr.trim().replace(/\n/g, '\n  ')));
    }
  }
  ```

  Step 2: In packages/cli/src/commands/demo.ts, add this import at the top
  with the other imports:

  ```typescript
  import { dumpErr } from '../lib/errors.js';
  ```

  Step 3: In packages/cli/src/commands/demo.ts, find every `catch (err: unknown)`
  block (there are at least 6: scaffold, git init, register, copy tasks,
  install deps, run agent). Before the `throw err;` line in each catch block,
  add a call to `dumpErr(err);`.

  Example transformation:

  Before:
  ```typescript
  } catch (err: unknown) {
    spinner.fail('Failed to scaffold Vite project');
    throw err;
  }
  ```

  After:
  ```typescript
  } catch (err: unknown) {
    spinner.fail('Failed to scaffold Vite project');
    dumpErr(err);
    throw err;
  }
  ```

  Apply this pattern to ALL catch blocks in demo.ts that wrap a child_process
  call. Do not add dumpErr to catch blocks that are just guarding optional
  cleanup (like the `try { execSync('git branch -D ...') } catch {}` blocks).
  Those are intentionally silent.

  Step 4: Verify the build passes and the help text still renders.

## T2: Add postinstall script to detect missing better-sqlite3 native build
- STATUS: failed
- FILES: packages/cli/package.json, packages/cli/scripts/check-native.js
- VERIFY: cd packages/cli && pnpm build && node scripts/check-native.js
- CRITIC: review
- PUSH: gate
- SPEC: When users install noxdev on Node 23/24/25, better-sqlite3 may fail
  to load at runtime with an opaque "Could not locate the bindings file" error.
  Add a postinstall script that detects this case and prints a clear fix.

  Step 1: Create packages/cli/scripts/check-native.js with this exact content:

  ```javascript
  // Postinstall check: verify better-sqlite3 native binding loads.
  // If it fails, print a clear message instead of letting the user hit
  // an opaque runtime error later.
  try {
    require('better-sqlite3');
    process.exit(0);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes('bindings') || msg.includes('NODE_MODULE_VERSION')) {
      console.error('');
      console.error('⚠ noxdev: better-sqlite3 native build is missing or incompatible.');
      console.error('');
      console.error('  Your Node version may not have a prebuilt binary.');
      console.error('  noxdev officially supports Node 20.x and 22.x LTS.');
      console.error('');
      console.error('  Fixes:');
      console.error('    1. Install Node 22 LTS:  nvm install 22 && nvm use 22');
      console.error('    2. Or rebuild manually:  pnpm rebuild better-sqlite3');
      console.error('');
      // Don't exit non-zero — install should succeed even if rebuild needed.
      process.exit(0);
    }
    // Some other error — let it surface but don't fail install
    console.error('noxdev postinstall check warning:', msg);
    process.exit(0);
  }
  ```

  Step 2: In packages/cli/package.json, add the postinstall script:

  ```json
  "scripts": {
    "postinstall": "node scripts/check-native.js"
  }
  ```

  If a "scripts" object already exists, just add the postinstall key inside it.
  Do not overwrite other existing scripts.

  Step 3: Add "scripts" to the "files" array in package.json so the script
  ships in the npm tarball. Verify with:

  ```bash
  npm pack --dry-run | grep "scripts/check-native"
  ```

  Step 4: Test by running `node scripts/check-native.js` directly. On a working
  install it should exit silently. The full install-time test happens after
  publish.

## T3: Pin Vite scaffold to pnpm dlx form for non-interactive reliability
- STATUS: done
- FILES: packages/cli/src/commands/demo.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js demo
- CRITIC: skip
- PUSH: gate
- SPEC: The current scaffold command uses `npm create vite@latest ${projectName}
  -- --template react-ts`. The double-dash flag passing is unreliable across
  npm versions and can drop the user into an interactive prompt that hangs
  inside execSync (no TTY available).

  In packages/cli/src/commands/demo.ts, find the line that scaffolds Vite
  (currently using `npm create vite@latest`). Replace it with the pnpm dlx
  form which passes flags directly without the double-dash:

  Before:
  ```typescript
  execSync(`npm create vite@latest ${projectName} -- --template react-ts`, {
    cwd: tmpdir(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  ```

  After:
  ```typescript
  execSync(`pnpm dlx create-vite@latest ${projectName} --template react-ts`, {
    cwd: tmpdir(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  ```

  Reasoning: pnpm dlx invokes create-vite directly, flags pass through cleanly,
  no interactive prompts can hang the build. This also keeps the toolchain
  consistent — noxdev is a pnpm-first project.

  Add a code comment above the line:
  ```typescript
  // pnpm dlx passes flags directly to create-vite without npm's `--` quirks
  ```

  Do not change any other part of the scaffold step. Build and verify the
  demo runs end-to-end.

## T4: Bump version to 1.0.3 and update CHANGELOG
- STATUS: done
- FILES: packages/cli/package.json, packages/cli/CHANGELOG.md
- VERIFY: cd packages/cli && pnpm build && node dist/index.js --version | grep "1.0.3"
- CRITIC: skip
- PUSH: gate
- SPEC: Bump the noxdev CLI version to 1.0.3 and document the changes.

  Step 1: In packages/cli/package.json, update the version field:
  ```json
  "version": "1.0.3"
  ```

  Step 2: In packages/cli/CHANGELOG.md, add a new section at the top
  (after the title, before the 1.0.2 entry):

  ```markdown
  ## [1.0.3] - 2026-04-09

  ### Fixed
  - `noxdev demo` now auto-cleans previous demo state on every run (no flag needed).
  - `noxdev remove` deletes the worktree branch in addition to the worktree itself.
  - `noxdev doctor` Node version check now matches `noxdev setup` — Node 23/24
    warn instead of fail, Node 25+ fails with install guidance.
  - `engines` field bumped to `">=20.0.0 <25.0.0"` to match runtime checks.

  ### Added
  - `dumpErr()` helper in `src/lib/errors.ts` — surfaces stderr/stdout from
    failed child_process calls instead of swallowing them. Applied throughout
    `noxdev demo` for clearer error diagnostics.
  - Postinstall check that detects missing `better-sqlite3` native binary and
    prints clear remediation steps instead of letting users hit an opaque
    runtime error.

  ### Changed
  - `noxdev demo` Vite scaffold now uses `pnpm dlx create-vite` instead of
    `npm create vite` for more reliable flag passing in non-interactive contexts.
  ```

  Step 3: Verify by running `node dist/index.js --version` after rebuild.
  Should print `1.0.3`.

  Do not publish to npm in this task — that's a manual step after Eugene
  reviews the build.
