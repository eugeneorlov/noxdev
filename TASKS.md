# noxdev Phase F: Re-run — T1 + T6 fixes

## T1: Fix diff capture to include untracked files
- STATUS: done

## T2: Improve critic credential snapshot reliability
- STATUS: done

## T3: Remove redundant Projects nav link from dashboard
- STATUS: done

## T4: Change task row expand icon from play to chevron
- STATUS: done

## T5: Fix owl logo visibility in dark mode
- STATUS: done

## T6: Fix dashboard merge review page data loading
- STATUS: done
- FILES: packages/dashboard/src/pages/MergeReview.tsx
- VERIFY: cd packages/dashboard && pnpm build && ! grep -q "TODO" packages/dashboard/src/pages/MergeReview.tsx
- CRITIC: skip
- PUSH: auto
- SPEC: Fix the MergeReview page to correctly load and display data.
  In packages/dashboard/src/pages/MergeReview.tsx:
  1. The page uses useParams() to get projectId. It must first fetch
     GET /api/projects/${projectId} to get the latest run ID. Extract
     the last_run_id field (or equivalent) from the response. Then fetch
     GET /api/runs/${lastRunId} to get the full run detail with task_results.
  2. Filter task_results to show only tasks where:
     status is 'COMPLETED' or 'COMPLETED_RETRY', AND commit_sha is not null.
     Tasks with no commit have nothing to merge.
  3. Handle null diff gracefully. When expanding a task to show its diff,
     fetch GET /api/runs/${runId}/tasks/${taskId}. If the response diff
     field is null or empty, render a div with className "text-gray-400
     italic p-4" containing "No diff available for this task." instead of
     passing null to the DiffViewer component.
  4. After a successful POST to /api/runs/${runId}/tasks/${taskId}/merge
     with body { decision: 'approved' } or { decision: 'rejected' },
     update the local React state immediately. Use useState with a
     Record<string, 'approved' | 'rejected'> to track decisions made this
     session. Merge local decisions with server data when rendering —
     local decisions override the server value for instant UI feedback.
  5. The "Merge" button at the bottom must be disabled while any
     mergeable task still has merge_decision === 'pending' AND no local
     decision override. When enabled, its onClick calls
     POST /api/merge/${projectId} and shows the result.
  6. If there are zero pending mergeable tasks, show:
     "All tasks reviewed. Nothing to merge." with a Link back to "/".
  Do NOT add browser navigation, visual testing, screenshots, or any
  exploratory behavior. Only modify the React component code.

## T7: npm publish verification script
- STATUS: done
