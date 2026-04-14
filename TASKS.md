# Merge feature removal

# Scope: Remove all dead noxdev merge machinery
# Dependencies: T1 must land before T2 (T2 deletes files T1 removed callers for)
# Gate: pnpm build && pnpm test pass; noxdev run executes without merge_decision crash
# Related: DECISIONS.md D-011
# DO NOT TOUCH: anything PUSH-related (separate task), migrate.ts (migration logic),
#               README line 35 (git merge workflow), DECISIONS.md, CHANGELOG.md

## T1: Stop the runtime crash — remove dead merge code from queries and consumers
- STATUS: done
- FILES: packages/cli/src/db/queries.ts, packages/cli/src/commands/status.ts, packages/cli/src/engine/summary.ts
- VERIFY: cd packages/cli && pnpm build && pnpm test && ! grep -rn "merge_decision\|merged_at\|getPendingMerge\|updateMergeDecision\|pendingMerge" src/ --exclude-dir=__tests__ --exclude=migrate.ts
- CRITIC: skip
- SPEC:
  In packages/cli/src/db/queries.ts:
  1. Delete lines 110-116 — the mergeDecision and mergedAt variable computation block
  2. Remove `merge_decision, merged_at,` from INSERT column list on line 122
  3. Remove `mergeDecision,` and `mergedAt,` from the .run() parameter tuple on lines 143-144
  4. Delete the entire updateMergeDecision function (lines 155-164)
  5. Delete the entire getPendingMerge function (lines 178-182)

  In packages/cli/src/commands/status.ts:
  6. Remove getPendingMerge from the import on line 8
  7. Delete the pending merge display block on lines 167-172
     (the "Pending merge: N tasks awaiting review" and "Next step: noxdev merge ..." lines)

  In packages/cli/src/engine/summary.ts:
  8. Remove getPendingMerge from the import on line 3
  9. Remove `pendingMerge: number` field from ProjectSummary interface on line 14
  10. Remove `pendingMerge: 0` from the no-run default branch on line 52
  11. Remove the getPendingMerge call and `pendingMerge: pending.length` assignment on lines 59, 70
  12. Remove the MERGE column header on line 100 and the mergeStr rendering on line 124

  Do NOT touch packages/cli/src/db/migrate.ts — merge_decision references there are migration
  detection logic and MUST stay.
  Do NOT touch packages/cli/src/merge/ — that's T2.

## T2: Delete the merge/ directory and clean test references
- STATUS: done
- FILES: packages/cli/src/merge/interactive.ts, packages/cli/src/merge/__tests__/merge-logic.test.ts, packages/cli/src/db/__tests__/queries.test.ts, packages/cli/src/commands/__tests__/status.test.ts
- VERIFY: cd packages/cli && pnpm build && pnpm test && [ ! -d src/merge ] && ! grep -rn "getPendingMerge\|updateMergeDecision" src/
- CRITIC: skip
- SPEC:
  Delete files:
  1. rm packages/cli/src/merge/interactive.ts
  2. rm packages/cli/src/merge/__tests__/merge-logic.test.ts
  3. rmdir packages/cli/src/merge/__tests__/ (if empty)
  4. rmdir packages/cli/src/merge/ (if empty)

  Clean test references to deleted functions in packages/cli/src/db/__tests__/queries.test.ts:
  5. Remove updateMergeDecision and getPendingMerge from imports (lines 9, 12)
  6. Remove the `expect(r.merge_decision).toBe("pending")` assertion on line 107
  7. Delete three test cases:
     - lines 130-141 (updateMergeDecision basic)
     - lines 144-155 (updateMergeDecision without mergedAt)
     - lines 158-170 (getPendingMerge)

  In packages/cli/src/commands/__tests__/status.test.ts:
  8. Delete the "shows pending merge count" test case on lines 128-173

## T3: Documentation cleanup
- STATUS: done
- FILES: IMPLEMENTATION_NOTES.md, packages/cli/README.md, README.md
- VERIFY: cd packages/cli && pnpm build && [ ! -f IMPLEMENTATION_NOTES.md ] && ! grep -q "noxdev merge" packages/cli/README.md && ! grep -q "visual merge review workflow" README.md && grep -q "git merge noxdev" README.md
- CRITIC: skip
- SPEC:
  1. Delete IMPLEMENTATION_NOTES.md entirely — 100% documentation of the deleted feature

  2. In packages/cli/README.md line 26, remove the line:
     `noxdev merge my-project # approve/reject commits`

  3. In README.md:
     - Line 123: remove or reword "provides a visual merge review workflow"
       (the dashboard merge review page no longer exists)
     - Line 102: the flow description currently reads
       `git commit → morning review (CLI or dashboard) → merge to main`
       Reword to:
       `git commit → morning review of changes → git merge noxdev/<project>`

  Do NOT touch:
  - DECISIONS.md — D-011 is the historical removal record
  - CHANGELOG.md — release notes are historical, including v0.1.0 entries
  - README.md lines 78-79 (push strategy table) — being removed by the separate PUSH removal task
  - README.md line 35 (`git merge noxdev/my-project`) — THE documented workflow, must stay
  - packages/cli/src/db/migrate.ts — migration logic

