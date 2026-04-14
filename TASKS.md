# v1.3.0 — no native deps, install UX fixes

# Theme: Eliminate native dependencies. Fix install UX end-to-end.
# Breaking: Node minimum bumps to 24 (stable node:sqlite, no flag).
# Dependencies: clean main, v1.2.0 published
# Gate: pnpm build && pnpm test pass; fresh `pnpm add -g @eugene218/noxdev` on Mac
#       proceeds to working state without any manual rebuilds or installs.
# Related: .audits/audit-install-ux-2026-04-14.md
# Out of scope: Windows native (use WSL2), credential validity check (claude login is manual)

## T1: Add openDb() helper as the canonical DB entry point
- STATUS: failed
- FILES: packages/cli/src/db/connection.ts
- VERIFY: cd packages/cli && pnpm build && node -e "import('./dist/db/connection.js').then(m => { const db = m.openDb(':memory:'); db.exec('CREATE TABLE t(x INTEGER)'); console.log('openDb works'); db.close(); })"
- CRITIC: review
- SPEC:
  Create new file packages/cli/src/db/connection.ts that wraps node:sqlite's DatabaseSync
  as the single canonical way noxdev opens a SQLite database. Nothing imports this yet —
  this task only adds the helper.

  Implementation:
```ts
  import { DatabaseSync } from "node:sqlite";

  export interface OpenDbOptions {
    readonly?: boolean;
  }

  export function openDb(path: string, options: OpenDbOptions = {}): DatabaseSync {
    const db = new DatabaseSync(path, {
      readOnly: options.readonly ?? false,
    });

    // Enable WAL mode for concurrent CLI + dashboard reads.
    // Skip for in-memory and read-only handles.
    if (path !== ":memory:" && !options.readonly) {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA foreign_keys = ON");
    }

    return db;
  }

  // Re-export DatabaseSync as Database for ergonomic imports across the codebase.
  export type Database = DatabaseSync;
```

  Notes:
  - node:sqlite uses `DatabaseSync` (synchronous) — matches better-sqlite3's sync API.
  - Pragmas use `.exec()` not a `.pragma()` method (API difference from better-sqlite3).
  - The `Database` type re-export means callers can do `import type { Database } from "../db/connection.js"`
    and migrations from better-sqlite3 type usage become a one-line import swap.

  Do NOT:
  - Import this from anywhere yet (T2-T5 do that).
  - Add any query logic here — this is connection only.
  - Import from "better-sqlite3" anywhere in this file.

## T2: Migrate db/index.ts to node:sqlite via openDb()
- STATUS: done
- FILES: packages/cli/src/db/index.ts
- VERIFY: cd packages/cli && pnpm build && ! grep -q "better-sqlite3" src/db/index.ts
- CRITIC: review
- SPEC:
  Replace the better-sqlite3 import and instantiation in packages/cli/src/db/index.ts
  with the openDb() helper from T1.

  1. Remove: `import Database from "better-sqlite3"`
  2. Add:    `import { openDb, type Database } from "./connection.js"`
  3. Replace any `new Database(path, opts)` calls with `openDb(path, opts)`.
  4. Update any type annotations that reference the better-sqlite3 Database type to use
     the re-exported Database type from connection.ts.
  5. If db/index.ts has its own pragma calls (PRAGMA journal_mode, etc.), REMOVE them —
     openDb() handles pragmas centrally now.

  Do NOT touch query logic, just the connection setup.

## T3: Migrate db/queries.ts and db/migrate.ts to node:sqlite API
- STATUS: failed
- FILES: packages/cli/src/db/queries.ts, packages/cli/src/db/migrate.ts
- VERIFY: cd packages/cli && pnpm build && pnpm test --run src/db && ! grep -rn "better-sqlite3" src/db/
- CRITIC: review
- SPEC:
  Migrate query and migration code from better-sqlite3 to node:sqlite. The APIs are similar
  but not identical — handle each known difference explicitly.

  In both packages/cli/src/db/queries.ts and packages/cli/src/db/migrate.ts:

  1. Replace import statements:
     - Remove: `import Database from "better-sqlite3"` (or `import type Database`)
     - Add:    `import type { Database } from "./connection.js"`

  2. Method-by-method migration. For each better-sqlite3 call, the node:sqlite equivalent:

     | better-sqlite3                              | node:sqlite                                |
     |---------------------------------------------|--------------------------------------------|
     | `db.prepare(sql).run(...params)`            | `db.prepare(sql).run(...params)` (same)    |
     | `db.prepare(sql).all(...params)`            | `db.prepare(sql).all(...params)` (same)    |
     | `db.prepare(sql).get(...params)`            | `db.prepare(sql).get(...params)` (same)    |
     | `db.prepare(sql).iterate(...)`              | `db.prepare(sql).iterate(...)` (same)      |
     | `db.exec(sql)`                              | `db.exec(sql)` (same)                      |
     | `db.pragma("foo = bar")`                    | `db.exec("PRAGMA foo = bar")`              |
     | `db.transaction((args) => {...})`           | Manual: `db.exec("BEGIN")`, then logic,    |
     |                                             | then `db.exec("COMMIT")` or `db.exec("ROLLBACK")` |
     | `.run()` returns `{ changes, lastInsertRowid }` | Same shape — works                     |

  3. Transaction handling — IMPORTANT API difference:
     better-sqlite3 has `db.transaction(fn)` which returns a callable. node:sqlite does NOT
     have this helper. Replace each transaction block with explicit BEGIN/COMMIT/ROLLBACK:

```ts
     // BEFORE (better-sqlite3):
     const insertMany = db.transaction((rows) => {
       for (const r of rows) insertStmt.run(r.id, r.name);
     });
     insertMany(rows);

     // AFTER (node:sqlite):
     function insertMany(rows) {
       db.exec("BEGIN");
       try {
         for (const r of rows) insertStmt.run(r.id, r.name);
         db.exec("COMMIT");
       } catch (err) {
         db.exec("ROLLBACK");
         throw err;
       }
     }
     insertMany(rows);
```

  4. Pragma calls in migrate.ts: replace `.pragma(...)` with `.exec("PRAGMA ...")`.

  5. The lastInsertRowid type from node:sqlite is `number | bigint`. Most code expects
     number — wrap with `Number()` if necessary at usage sites.

  6. The `BindValue` type from node:sqlite restricts what can be passed as parameters
     (string | number | bigint | Buffer | null). If queries.ts passes anything else
     (e.g., booleans), convert to int (0/1) at the call site.

  Do NOT modify the SQL itself, table schemas, or business logic. This is API translation only.

## T4: Migrate dashboard/api/db.ts to openDb()
- STATUS: failed
- FILES: packages/dashboard/src/api/db.ts
- VERIFY: cd packages/dashboard && pnpm build && ! grep -q "better-sqlite3" src/api/db.ts
- CRITIC: review
- SPEC:
  Dashboard uses a read-only DB handle to display ledger data. Migrate to openDb().

  In packages/dashboard/src/api/db.ts:
  1. Remove: `import Database from "better-sqlite3"`
  2. Add:    `import { openDb, type Database } from "../../../cli/src/db/connection.js"`
     (Adjust the relative path to wherever connection.ts lives — verify it resolves.)
  3. Replace `new Database(path, { readonly: true })` with `openDb(path, { readonly: true })`.
  4. Update any type annotations using the better-sqlite3 Database type.

  If the relative cross-package import is awkward, the alternative is to copy openDb() into
  dashboard's own connection.ts. Prefer the import to avoid drift, but use copy if Turborepo
  build complains about cross-package source imports.

## T5: Migrate test files to node:sqlite
- STATUS: done
- FILES: packages/cli/src/db/__tests__/queries.test.ts, packages/cli/src/commands/__tests__/log.test.ts, packages/cli/src/commands/__tests__/run-multi.test.ts, packages/cli/src/commands/__tests__/status.test.ts
- VERIFY: cd packages/cli && pnpm test --run && ! grep -rn "better-sqlite3" src/
- CRITIC: review
- SPEC:
  Migrate the four test files that import better-sqlite3 directly to use openDb() with
  in-memory databases.

  For each file:
  1. Remove: `import Database from "better-sqlite3"`
  2. Add:    `import { openDb } from "../../db/connection.js"` (adjust relative path per file)
  3. Replace `new Database(":memory:")` with `openDb(":memory:")`.
  4. Apply the same API translations as T3 if any test exercises:
     - .pragma() calls → .exec("PRAGMA ...")
     - .transaction() → BEGIN/COMMIT/ROLLBACK
     - .lastInsertRowid usage → Number(...) wrap if needed

  Tests should pass without changes to assertions. If any assertion fails due to a real
  semantic difference (e.g. lastInsertRowid type), update the assertion to match node:sqlite
  behavior — do not paper over genuine bugs.

  Do NOT investigate or modify the in-memory test masking concern noted in earlier audits.
  If tests pass, move on. If they fail, fix the test honestly.

## T6: Drop better-sqlite3 dependency, kill postinstall, bump Node minimum to 24
- STATUS: failed
- FILES: packages/cli/package.json, packages/dashboard/package.json, package.json, packages/cli/scripts/check-native.js
- VERIFY: cd packages/cli && pnpm install && pnpm build && pnpm test && ! grep -q "better-sqlite3" package.json && ! grep -q "check-native" package.json && [ ! -f scripts/check-native.js ]
- CRITIC: review
- SPEC:
  Remove all traces of better-sqlite3 and the postinstall machinery built around it.

  1. packages/cli/package.json:
     - Remove "better-sqlite3" from dependencies
     - Remove the "postinstall": "node scripts/check-native.js" script
     - Update "engines": { "node": ">=24" } (was 18 or 20)

  2. packages/dashboard/package.json:
     - Remove "better-sqlite3" from dependencies
     - Update "engines": { "node": ">=24" }

  3. Root package.json:
     - Remove the "pnpm": { "onlyBuiltDependencies": [...] } block entirely if better-sqlite3
       was the only entry. If esbuild is still listed, keep the block with just esbuild.
     - Update root "engines": { "node": ">=24" }

  4. Delete the file packages/cli/scripts/check-native.js entirely.

  5. After all changes, run `pnpm install` to update pnpm-lock.yaml. Commit the lockfile.

  Do NOT:
  - Touch any other dependencies.
  - Modify Dockerfile (Docker image runs Node 22 internally for now — that's fine, the
    constraint is on the user's host machine, not the container).

## T7: noxdev setup auto-installs @anthropic-ai/claude-code and prompts for login if unauth
- STATUS: done
- FILES: packages/cli/src/commands/setup.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js setup --help
- CRITIC: review
- SPEC:
  Replace the hard-fail Claude CLI check with auto-install. After install, check if
  ~/.claude.json exists; if not, exit cleanly with instructions to run `claude login`
  and re-run setup.

  In packages/cli/src/commands/setup.ts, modify the Claude CLI check block (currently
  lines 96-103):

  1. Wrap `execSync('claude --version', { stdio: 'ignore' })` in try/catch.

  2. On success: print green check "Claude Code CLI installed", continue.

  3. On failure (claude not in PATH):
     a. Print: "Claude Code CLI not found. Installing automatically..."
     b. Detect package manager (prefer pnpm if available):
```ts
        const pm = (() => {
          try { execSync('pnpm --version', { stdio: 'ignore' }); return 'pnpm'; }
          catch { return 'npm'; }
        })();
        const installCmd = pm === 'pnpm'
          ? 'pnpm add -g @anthropic-ai/claude-code'
          : 'npm install -g @anthropic-ai/claude-code';
```
     c. Run the install with `execSync(installCmd, { stdio: 'inherit' })` so user sees
        progress and any permission errors live.
     d. Re-verify: `execSync('claude --version', { stdio: 'ignore' })`. If still fails,
        print red error with the install command that was tried, exit 1.
     e. On success: print green check, continue.

  4. AFTER the Claude CLI check (whether passed initially or auto-installed), add a NEW
     check for ~/.claude.json existence:
```ts
     import { existsSync } from "node:fs";
     import { homedir } from "node:os";
     import { join } from "node:path";

     const claudeAuthPath = join(homedir(), ".claude.json");
     if (!existsSync(claudeAuthPath)) {
       console.log("");
       console.log(chalk.yellow("⚠ Authentication required."));
       console.log("  Run: " + chalk.cyan("claude login"));
       console.log("  Then re-run: " + chalk.cyan("noxdev setup"));
       console.log("");
       process.exit(0);
     }
```
     (Match the existing chalk and console.log patterns in setup.ts.)

  This new auth check sits between the Claude CLI check and the Docker checks. If auth
  is missing, setup exits cleanly with instructions — does NOT proceed to Docker build
  (no point until auth works).

  Do NOT:
  - Attempt to invoke `claude login` automatically (it's interactive OAuth).
  - Add @anthropic-ai/claude-code as a noxdev package.json dependency (it stays a global
    peer tool).
  - Modify the existing Node version check (step A1) or Docker checks.

## T8: Doctor adds "Claude Code CLI in PATH" check
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js doctor
- CRITIC: review
- SPEC:
  Doctor currently checks for ~/.claude.json (auth file existence) but does NOT check
  whether the `claude` CLI is actually installed and in PATH. Add this check.

  In packages/cli/src/commands/doctor.ts, add a new check that runs BEFORE the existing
  "Claude credentials" check (which is around line 165):

```ts
  {
    name: "Claude Code CLI",
    check: () => {
      try {
        const version = execSync('claude --version', {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        return { ok: true, detail: version };
      } catch {
        return {
          ok: false,
          detail: "claude not in PATH. Run: noxdev setup (auto-installs)"
        };
      }
    },
    critical: true
  }
```

  Match the existing check-object shape used elsewhere in doctor.ts. If the structure
  uses a different pattern (e.g., async, different field names), adapt accordingly.

  Update the total check count display so it dynamically reflects the actual count
  (e.g., `${passed}/${total}` where total = checks.length, not a hardcoded 11).

  Do NOT modify any other check. Do NOT change the existing Claude credentials check —
  it stays as file-existence (per decision: real auth validation isn't possible without
  triggering OAuth).

## T9: Doctor adds "node:sqlite available" check
- STATUS: done
- FILES: packages/cli/src/commands/doctor.ts
- VERIFY: cd packages/cli && pnpm build && node dist/index.js doctor | grep -q "node:sqlite"
- CRITIC: skip
- SPEC:
  Add a check that confirms node:sqlite is available. With Node 24+ this should always
  pass — the check is documentation as much as validation, and protects against future
  Node versions that might gate it behind a flag again.

  In packages/cli/src/commands/doctor.ts, add a new check immediately before the existing
  "SQLite database" check (around line 107):

```ts
  {
    name: "node:sqlite available",
    check: async () => {
      try {
        await import("node:sqlite");
        return { ok: true, detail: "built-in" };
      } catch (err: any) {
        return {
          ok: false,
          detail: `node:sqlite unavailable: ${err.message}. Requires Node >=24.`
        };
      }
    },
    critical: true
  }
```

  Adapt to the existing check structure in the file. Update total check count display
  (now should be 13 with T8 + T9 added, but use checks.length not a hardcoded number).

  The existing "SQLite database" check (~line 107) that opens the ledger DB stays. It now
  uses node:sqlite via openDb() per T2 — but in doctor.ts the import path may need updating
  if it directly imports better-sqlite3 still. Verify and update if so.

## T10: Update README.md and packages/cli/README.md for v1.3.0
- STATUS: done
- FILES: README.md, packages/cli/README.md
- VERIFY: ! grep -rni "better-sqlite3\|npm rebuild" README.md packages/cli/README.md && grep -q "Node.js >= 24" README.md && grep -qi "WSL2" README.md
- CRITIC: review
- SPEC:
  Update both READMEs to reflect v1.3.0 reality.

  In README.md:

  1. Update Requirements section:
     - Change "Node.js >= 20 < 23" to "Node.js >= 24"
     - Change "Claude CLI (`claude login` required)" to "Claude Code CLI (auto-installed by `noxdev setup`; run `claude login` after)"
     - Add: "Windows users: run noxdev under WSL2. Native Windows is not supported."

  2. Update version badge (line 9) from `1.2.0` to `1.3.0`.

  3. Remove or update any reference to `npm rebuild better-sqlite3` if present.

  4. In the "Built With" section (or equivalent), if better-sqlite3 was mentioned, replace
     with mention of node:sqlite (Node's built-in SQLite). If no such section exists, no change.

  In packages/cli/README.md:

  5. Same Node version bump and WSL2 note.

  6. Remove any line referencing `noxdev merge` if still present (safety net — should already
     be gone from prior cleanup, but verify).

  Do NOT touch:
  - DECISIONS.md, CHANGELOG.md historical entries, session handoffs.
  - Anything outside the Requirements/badge sections unless explicitly listed above.

## T11: CHANGELOG entry for v1.3.0
- STATUS: done
- FILES: CHANGELOG.md, packages/cli/package.json, packages/dashboard/package.json
- VERIFY: grep -q "## \[1.3.0\]" CHANGELOG.md && grep -q '"version": "1.3.0"' packages/cli/package.json
- CRITIC: skip
- SPEC:
  Add a CHANGELOG entry for v1.3.0 and bump version strings.

  1. In CHANGELOG.md, add a new section above [1.2.0]:

```markdown
  ## [1.3.0] - 2026-04-14

  ### Breaking
  - Node.js minimum bumped to 24. Node 22 is no longer supported.
    This enables use of the built-in `node:sqlite` module and eliminates native binary install pain.

  ### Removed
  - `better-sqlite3` dependency. Replaced with Node's built-in `node:sqlite` module.
  - `check-native.js` postinstall script (no native dependencies left to validate).
  - "rebuild better-sqlite3" troubleshooting from documentation (no longer applicable).

  ### Added
  - `noxdev setup` now auto-installs `@anthropic-ai/claude-code` if not in PATH.
  - `noxdev setup` detects missing Claude authentication and exits cleanly with instructions to run `claude login`.
  - `noxdev doctor` now checks for Claude Code CLI in PATH (separate from credentials check).
  - `noxdev doctor` now checks for `node:sqlite` availability.

  ### Changed
  - All SQLite access migrated from `better-sqlite3` to `node:sqlite`.
  - Internal: introduced `openDb()` helper as the single canonical DB connection point.
```

  2. Bump version in packages/cli/package.json: `"version": "1.3.0"`
  3. Bump version in packages/dashboard/package.json: `"version": "1.3.0"`
  4. If root package.json has a version, bump it too.

  Do NOT modify any earlier CHANGELOG entries.

