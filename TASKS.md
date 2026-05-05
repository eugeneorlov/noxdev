# noxdev: Audit-Fix Loop (Opus Two-Model Pipeline)

# Feature: After Sonnet implements a task, Opus audits the implementation against
# the spec and fixes gaps in a single container. A separate Opus re-audit confirms.
# Up to 3 audit-fix attempts per task before marking failed.
#
# Dependencies: v1.3.5 codebase, no other feature branches
# Gate between sessions: pnpm build
#
# Session 1: T1–T3 (config, auth, parser — foundation types)
# Session 2: T4–T6 (db schema, db queries, engine types)
# Session 3: T7–T9 (prompt builders — audit, fix+audit combo, re-audit)
# Session 4: T10–T11 (docker model threading — types, runner, bash scripts)
# Session 5: T12–T13 (orchestrator — the main loop, run.ts context threading)

## T1: Add audit config to GlobalConfig and defaults
- STATUS: done
- FILES: packages/cli/src/config/types.ts, packages/cli/src/config/index.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const c = require('./dist/config/index.js'); const d = c.DEFAULT_GLOBAL_CONFIG || c.defaultGlobalConfig; console.log(JSON.stringify(d))" 2>/dev/null | grep -q '"audit"' && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Add audit configuration block to GlobalConfig and wire defaults.
  In packages/cli/src/config/types.ts, add to the GlobalConfig interface:
  ```typescript
  audit: {
    enabled: boolean;
    model: string;
    max_attempts: number;
  };
  ```
  In packages/cli/src/config/index.ts, add to DEFAULT_GLOBAL_CONFIG:
  ```typescript
  audit: {
    enabled: true,
    model: "claude-opus-4-6",
    max_attempts: 3,
  },
  ```
  The deepMerge() function already handles nested objects, so config.json
  overrides will merge correctly without changes.
  Do NOT change any other config fields or defaults.

## T2: Add resolveAuditAuth to auth module
- STATUS: done
- FILES: packages/cli/src/auth/index.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const a = require('./dist/auth/index.js'); console.log(typeof a.resolveAuditAuth)" 2>/dev/null | grep -q "function" && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Add a function that resolves auth specifically for the Opus audit/fix pass.
  In packages/cli/src/auth/index.ts, add:
  ```typescript
  export function resolveAuditAuth(config: AuthConfig, auditModel: string): AuthResult {
    // Audit always runs via API with the specified model (Opus).
    // Max plan does not support Opus model selection, so we force API mode.
    if (config.api?.fallback && config.api?.key) {
      return {
        mode: 'api' as AuthMode,
        apiKey: config.api.key,
        model: auditModel,
      };
    }
    // If no API key configured, fall back to max with default model.
    // This is degraded mode — Opus won't be used, but execution continues.
    if (isMaxAvailable()) {
      return {
        mode: 'max' as AuthMode,
        model: auditModel,
      };
    }
    throw new Error('Audit requires API key for Opus model. Configure api.key in ~/.noxdev/config.json');
  }
  ```
  Import AuthConfig from the config types if not already imported.
  Export resolveAuditAuth alongside the existing resolveAuth.
  Do NOT modify resolveAuth() or any other existing function.

## T3: Add AUDIT field to TASKS.md parser
- STATUS: done
- FILES: packages/cli/src/parser/tasks.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const p = require('./dist/parser/tasks.js'); const r = p.parseTasks('## T1: Test\n- STATUS: pending\n- FILES: foo.ts\n- VERIFY: echo ok\n- CRITIC: skip\n- AUDIT: skip\n- SPEC: do thing\n'); console.log(r[0].audit)" 2>/dev/null | grep -q "skip" && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Add AUDIT as a recognized field in the TASKS.md parser.
  In packages/cli/src/parser/tasks.ts:
  1. Add "audit" to the ParsedTask type:
     ```typescript
     audit?: 'skip' | 'enabled';
     ```
  2. Add AUDIT to the FIELD_RE alternation. Find the regex that matches
     field names (STATUS|FILES|VERIFY|CRITIC|SPEC) and add AUDIT:
     ```
     STATUS|FILES|VERIFY|CRITIC|AUDIT|SPEC
     ```
  3. In the parsing logic where fields are assigned to the task object,
     add handling for the AUDIT field:
     ```typescript
     case 'audit':
       currentTask.audit = value.trim().toLowerCase() as 'skip' | 'enabled';
       break;
     ```
  Default when AUDIT field is absent: undefined (orchestrator will check
  global config audit.enabled as fallback).
  Do NOT change any other parser behavior, field ordering, or regex structure.

## T4: Add audit columns to SQLite schema and migration
- STATUS: done
- FILES: packages/cli/src/db/migrate.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const m = require('./dist/db/migrate.js'); const s = m.SCHEMA || ''; console.log(s)" 2>/dev/null | grep -q "audit_attempt" && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Add three columns to the task_results table for audit tracking.
  In packages/cli/src/db/migrate.ts:
  1. In the SCHEMA const, add to the task_results CREATE TABLE statement,
     after the existing columns (before the closing parenthesis):
     ```sql
     audit_attempt     INTEGER,
     audit_log_file    TEXT,
     gap_analysis_file TEXT,
     ```
  2. Add idempotent ALTER TABLE migrations for existing databases.
     Follow the existing pattern that uses PRAGMA table_info() to detect
     missing columns. Add after the existing migration blocks:
     ```typescript
     // Audit-fix loop columns (v1.4.0)
     const taskResultCols = db.prepare("PRAGMA table_info('task_results')").all() as Array<{name: string}>;
     const colNames = taskResultCols.map(c => c.name);
     if (!colNames.includes('audit_attempt')) {
       db.exec("ALTER TABLE task_results ADD COLUMN audit_attempt INTEGER");
     }
     if (!colNames.includes('audit_log_file')) {
       db.exec("ALTER TABLE task_results ADD COLUMN audit_log_file TEXT");
     }
     if (!colNames.includes('gap_analysis_file')) {
       db.exec("ALTER TABLE task_results ADD COLUMN gap_analysis_file TEXT");
     }
     ```
  Do NOT modify any existing columns or migration logic.

## T5: Extend insertTaskResult with audit fields
- STATUS: done
- FILES: packages/cli/src/db/queries.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "audit_attempt" dist/db/queries.js && grep -q "gap_analysis_file" dist/db/queries.js && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Extend the insertTaskResult() function to accept and store audit fields.
  In packages/cli/src/db/queries.ts, find the insertTaskResult() function.
  It currently has ~23 named params.
  1. Add to the function parameters (as optional):
     ```typescript
     auditAttempt?: number | null,
     auditLogFile?: string | null,
     gapAnalysisFile?: string | null,
     ```
  2. Add the three columns to the INSERT statement's column list and
     VALUES placeholder list. Use the same pattern as existing nullable
     columns (pass null when not provided).
  3. Add the three values to the parameter binding object.
  Do NOT change any other query functions. Do NOT rename existing parameters.
  Preserve the existing parameter ordering — add new params at the end.

## T6: Add auditAttempt and gapAnalysisFile to TaskExecResult
- STATUS: done
- FILES: packages/cli/src/engine/types.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "auditAttempt" dist/engine/types.js 2>/dev/null; grep -q "gapAnalysisFile" dist/engine/types.js 2>/dev/null; echo "PASS"
- CRITIC: skip
- SPEC: Extend the TaskExecResult type in packages/cli/src/engine/types.ts.
  Add two optional fields:
  ```typescript
  auditAttempt?: number;
  gapAnalysisFile?: string | null;
  ```
  Do NOT change RunContext or any other types in this file.

## T7: Build audit+fix prompt builder
- STATUS: done
- FILES: packages/cli/src/prompts/builder.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const b = require('./dist/prompts/builder.js'); console.log(typeof b.buildAuditFixPrompt)" 2>/dev/null | grep -q "function" && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Add the combined audit+fix prompt builder. This prompt drives a single
  Opus container that first audits the implementation against the spec, writes
  a gap analysis file, then fixes all gaps it found.
  In packages/cli/src/prompts/builder.ts, add:
  ```typescript
  export function buildAuditFixPrompt(
    task: ParsedTask,
    diffContent: string,
    gapFilePath: string,
    previousGapAnalysis?: string,
  ): string {
    const preamble = [
      'CRITICAL CONSTRAINT: The SPEC below is the sole source of truth.',
      'Do NOT deviate from it. Do NOT improve it. Do NOT reinterpret it.',
      'If the spec is ambiguous, implement the most literal reading.',
      'If the spec is impossible, write the reason to the gap analysis file and stop.',
    ].join('\n');

    const sections = [
      preamble,
      '',
      `## Task: ${task.taskId}: ${task.title}`,
      '',
      '## Specification (source of truth)',
      task.spec,
      '',
      '## Files referenced',
      task.files || '(none specified)',
      '',
      '## Current diff (changes made by developer agent)',
      '```',
      diffContent,
      '```',
    ];

    if (previousGapAnalysis) {
      sections.push(
        '',
        '## Previous gap analysis (attempt failed to fully fix — try again)',
        previousGapAnalysis,
      );
    }

    sections.push(
      '',
      '## Your task',
      '1. Compare the diff against the specification above.',
      '2. Identify ALL gaps: missing functionality, wrong behavior, spec deviations,',
      '   skipped requirements, TODO placeholders, incorrect implementations.',
      `3. Write your gap analysis to: ${gapFilePath}`,
      '   Format: one gap per line, prefixed with "- GAP: " followed by description.',
      '   If no gaps found, write a single line: "- NO_GAPS_FOUND"',
      '4. Fix every gap you identified. Edit the source files directly.',
      '5. Do NOT add functionality beyond what the spec requires.',
      '6. Do NOT refactor or improve code outside the scope of identified gaps.',
      '',
      `## Verify command: ${task.verify}`,
      'After fixing, run the verify command. It must pass.',
    );

    return sections.join('\n');
  }
  ```
  Do NOT modify buildTaskPrompt() or buildCriticPrompt(). Export the new
  function alongside existing exports.

## T8: Build re-audit prompt builder
- STATUS: done
- FILES: packages/cli/src/prompts/builder.ts
- VERIFY: cd packages/cli && pnpm build && node -e "const b = require('./dist/prompts/builder.js'); console.log(typeof b.buildReAuditPrompt)" 2>/dev/null | grep -q "function" && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Add the re-audit prompt builder. This drives a SEPARATE Opus container
  that only audits (no fixing) — clean eyes, no context from the fix pass.
  In packages/cli/src/prompts/builder.ts, add:
  ```typescript
  export function buildReAuditPrompt(
    task: ParsedTask,
    diffContent: string,
    previousGapAnalysis: string,
    gapFilePath: string,
  ): string {
    const preamble = [
      'CRITICAL CONSTRAINT: The SPEC below is the sole source of truth.',
      'You are a REVIEWER. Do NOT modify any code.',
      'Your ONLY job is to verify whether the implementation matches the spec.',
    ].join('\n');

    const sections = [
      preamble,
      '',
      `## Task: ${task.taskId}: ${task.title}`,
      '',
      '## Specification (source of truth)',
      task.spec,
      '',
      '## Files referenced',
      task.files || '(none specified)',
      '',
      '## Current diff (all changes, including fixes)',
      '```',
      diffContent,
      '```',
      '',
      '## Previous gap analysis',
      previousGapAnalysis,
      '',
      '## Your task',
      '1. Read the spec carefully.',
      '2. Read the diff carefully.',
      '3. Check whether ALL gaps from the previous analysis are now fixed.',
      '4. Check for any NEW gaps introduced by the fix.',
      `5. Write your findings to: ${gapFilePath}`,
      '   Format: one gap per line, prefixed with "- GAP: "',
      '   If all gaps are fixed and no new gaps: write "- NO_GAPS_FOUND"',
      '6. Do NOT modify any source code. You are read-only.',
      '',
      `## Verify command: ${task.verify}`,
      'Run the verify command to confirm the build still passes. Report if it fails.',
    ];

    return sections.join('\n');
  }
  ```
  Do NOT modify any existing prompt builders. Export alongside existing exports.

## T9: Add model arg to Docker types and runner
- STATUS: done
- FILES: packages/cli/src/docker/types.ts, packages/cli/src/docker/runner.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "model" dist/docker/types.js 2>/dev/null && grep "model" dist/docker/runner.js | head -3 && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Thread model selection through the Docker runner so the orchestrator
  can switch between Sonnet (dev) and Opus (audit) per invocation.
  1. In packages/cli/src/docker/types.ts, add to DockerRunOptions:
     ```typescript
     model?: string;
     ```
  2. In packages/cli/src/docker/runner.ts, in the runTaskInDocker() function:
     Find where it builds the args array for the bash script invocation.
     For docker-run-api.sh: add options.model (or auth.model as fallback)
     as the last argument after the existing args.
     For docker-run-max.sh: add options.model (or auth.model as fallback)
     as the last argument after the existing args.
     The bash scripts will be updated in the next task to accept this arg.
     If options.model is undefined, pass auth.model (preserving current behavior).
  Do NOT change the function signature of runTaskInDocker(). The model
  flows through the existing options object.

## T10: Add model arg to bash Docker scripts
- STATUS: done
- FILES: packages/cli/scripts/docker-run-max.sh, packages/cli/scripts/docker-run-api.sh
- VERIFY: cd packages/cli && grep -q 'model=' scripts/docker-run-max.sh && grep -q 'model=' scripts/docker-run-api.sh && grep -q '"$model"' scripts/docker-run-max.sh && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: Accept model as the last positional argument in both Docker scripts,
  replacing the current hardcoded model.
  In packages/cli/scripts/docker-run-max.sh:
  - The script currently takes 9 args. Add a 10th:
    ```bash
    model="${10:-claude-sonnet-4-20250514}"
    ```
  - Find the line with `--model claude-sonnet-4-20250514` (or similar hardcoded
    model string) and replace with `--model "$model"`.
  In packages/cli/scripts/docker-run-api.sh:
  - The script currently takes 10 args. Add an 11th:
    ```bash
    model="${11:-claude-sonnet-4-20250514}"
    ```
  - Find the hardcoded --model and replace with `--model "$model"`.
  Both scripts must default to Sonnet if the arg is not provided (backward
  compatible — existing calls without the arg still work).
  Do NOT change any other script behavior: volume mounts, env vars, flags,
  timeout handling, credential restore.

## T11: Implement audit-fix loop in orchestrator
- STATUS: pending
- FILES: packages/cli/src/engine/orchestrator.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "runAuditAndFix" dist/engine/orchestrator.js && grep -q "runReAudit" dist/engine/orchestrator.js && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: This is the core change. Replace/extend the critic flow with the
  audit-fix loop. Use runCritic() as the structural template.
  
  In packages/cli/src/engine/orchestrator.ts:
  
  1. Add imports for buildAuditFixPrompt, buildReAuditPrompt from prompts/builder.
     Add import for resolveAuditAuth from auth/index.
  
  2. Add function runAuditAndFix():
     ```typescript
     async function runAuditAndFix(
       ctx: RunContext,
       task: ParsedTask,
       logDir: string,
       auditAttempt: number,
       claudeJsonSrc: string,
       claudeSnapshot: Buffer,
       preTaskSha: string,
       previousGapAnalysis?: string,
     ): Promise<{ fixed: boolean; gapAnalysisFile: string; auditLogFile: string }> {
       // 1. Capture current diff
       const diffFile = path.join(logDir, `audit-diff-attempt-${auditAttempt}.patch`);
       captureDiff(ctx.worktreeDir, diffFile, preTaskSha);
       const diffContent = fs.readFileSync(diffFile, 'utf-8');
       
       // 2. Build audit+fix prompt
       const gapFile = path.join(logDir, `gap-analysis-T${task.taskId}-attempt-${auditAttempt}.md`);
       // gapFile path inside container = same as host since worktree is mounted
       const gapFileInContainer = gapFile; // adjust if paths differ
       const prompt = buildAuditFixPrompt(task, diffContent, gapFileInContainer, previousGapAnalysis);
       
       // 3. Write prompt to temp file
       const promptFile = path.join(logDir, `audit-fix-prompt-attempt-${auditAttempt}.md`);
       fs.writeFileSync(promptFile, prompt, 'utf-8');
       
       // 4. Resolve Opus auth
       const globalConfig = loadGlobalConfig(); // import from config
       const auditAuth = resolveAuditAuth(globalConfig.api || {}, globalConfig.audit?.model || 'claude-opus-4-6');
       
       // 5. Restore credential snapshot before Docker run
       fs.copyFileSync(claudeSnapshot, claudeJsonSrc); // same pattern as runCritic
       
       // 6. Run Docker with Opus model
       const auditLog = path.join(logDir, `audit-fix-attempt-${auditAttempt}.log`);
       const result = runTaskInDocker({
         promptFile,
         taskLog: auditLog,
         timeoutSeconds: ctx.projectConfig?.docker?.timeout_minutes ? ctx.projectConfig.docker.timeout_minutes * 60 : 1800,
         worktreeDir: ctx.worktreeDir,
         projectGitDir: ctx.projectGitDir,
         gitTargetPath: ctx.gitTargetPath,
         memoryLimit: ctx.projectConfig?.docker?.memory || '4g',
         cpuLimit: ctx.projectConfig?.docker?.cpus || 2,
         dockerImage: 'noxdev-runner:latest',
         model: globalConfig.audit?.model || 'claude-opus-4-6',
       }, auditAuth);
       
       // 7. Check if gap file was written and contains NO_GAPS_FOUND
       let fixed = false;
       if (fs.existsSync(gapFile)) {
         const gaps = fs.readFileSync(gapFile, 'utf-8');
         fixed = gaps.includes('NO_GAPS_FOUND');
       }
       
       return { fixed, gapAnalysisFile: gapFile, auditLogFile: auditLog };
     }
     ```
     Adapt this pseudocode to match the exact patterns in the existing
     runCritic() function — same credential restore dance, same Docker
     option construction, same error handling. Use runCritic() as the
     template; do not invent new patterns.
  
  3. Add function runReAudit():
     ```typescript
     async function runReAudit(
       ctx: RunContext,
       task: ParsedTask,
       logDir: string,
       auditAttempt: number,
       claudeJsonSrc: string,
       claudeSnapshot: Buffer,
       preTaskSha: string,
       previousGapAnalysis: string,
     ): Promise<{ clean: boolean; gapAnalysisFile: string; auditLogFile: string }> {
       // Same structure as runAuditAndFix but:
       // - Uses buildReAuditPrompt (read-only, no fixing)
       // - Separate container = clean eyes
       // - Returns clean: true if NO_GAPS_FOUND
       // Follow identical Docker/credential/diff pattern as runAuditAndFix
     }
     ```
  
  4. Modify executeTask() to add audit-fix loop after the developer pass.
     After the developer agent completes and VERIFY passes, insert:
     ```typescript
     // Audit-fix loop (if enabled)
     const auditEnabled = task.audit !== 'skip' && (globalConfig.audit?.enabled !== false);
     if (auditEnabled) {
       const maxAuditAttempts = globalConfig.audit?.max_attempts || 3;
       let auditAttempt = 0;
       let lastGapAnalysis: string | undefined;
       let lastGapFile: string | undefined;
       let lastAuditLog: string | undefined;
       
       for (auditAttempt = 1; auditAttempt <= maxAuditAttempts; auditAttempt++) {
         // Run audit + fix
         const auditResult = await runAuditAndFix(
           ctx, task, logDir, auditAttempt,
           claudeJsonSrc, claudeSnapshot, preTaskSha, lastGapAnalysis,
         );
         lastGapFile = auditResult.gapAnalysisFile;
         lastAuditLog = auditResult.auditLogFile;
         
         // Run VERIFY after fix
         // ... reuse existing verify logic from executeTask ...
         
         // Run re-audit (clean eyes)
         const reauditResult = await runReAudit(
           ctx, task, logDir, auditAttempt,
           claudeJsonSrc, claudeSnapshot, preTaskSha,
           fs.readFileSync(auditResult.gapAnalysisFile, 'utf-8'),
         );
         
         if (reauditResult.clean) {
           // All gaps fixed, done
           break;
         }
         
         // Feed re-audit gap analysis back into next attempt
         lastGapAnalysis = fs.readFileSync(reauditResult.gapAnalysisFile, 'utf-8');
       }
       
       // Store audit metadata in result
       // ... set auditAttempt, gapAnalysisFile on TaskExecResult ...
       
       if (auditAttempt > maxAuditAttempts) {
         // Mark as failed — existing circuit breaker handles run-level abort
         // ... set status to failed with gap analysis attached ...
       }
     }
     ```
     This is pseudocode showing the flow. Integrate it into the existing
     executeTask() control flow, reusing the existing verify/commit/error
     patterns. Do not restructure executeTask() — extend it.
  
  5. Do NOT delete runCritic(). Leave it in place — tasks with CRITIC: review
     and AUDIT: skip should still use the existing critic path.
     The selection logic: if AUDIT is enabled for a task, skip critic and
     run audit-fix loop instead. If AUDIT is skip, fall through to existing
     critic behavior.
  
  6. Update the insertTaskResult() call at the end of executeTask() to pass
     the new auditAttempt, auditLogFile, gapAnalysisFile fields.

## T12: Thread globalConfig into RunContext for audit auth resolution
- STATUS: pending
- FILES: packages/cli/src/engine/types.ts, packages/cli/src/commands/run.ts
- VERIFY: cd packages/cli && pnpm build && grep -q "globalConfig" dist/engine/types.js 2>/dev/null && echo "PASS" || echo "FAIL"
- CRITIC: skip
- SPEC: The orchestrator needs access to globalConfig to call resolveAuditAuth()
  and read audit settings. Currently RunContext has projectConfig but not
  globalConfig.
  1. In packages/cli/src/engine/types.ts, add to RunContext:
     ```typescript
     globalConfig: GlobalConfig;
     ```
     Import GlobalConfig from config/types.
  2. In packages/cli/src/commands/run.ts, where RunContext is constructed
     before calling executeRun(), add globalConfig to the context object.
     loadGlobalConfig() is likely already called in run.ts — pass its
     result into the context.
  If loadGlobalConfig() is not already called in run.ts, add the import
  and call it. It's a pure function that reads ~/.noxdev/config.json.
  Do NOT change any other RunContext fields.
