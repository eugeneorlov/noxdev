# noxdev Decisions Log

Append-only record of significant decisions: what was decided, why, what alternatives were rejected. Newest entries at the top. Dates in ISO format.

Format per entry:
- **Title** — one-line summary
- **Date** — YYYY-MM-DD
- **Context** — what prompted the decision
- **Decision** — what was decided
- **Alternatives considered** — what was rejected and why
- **Consequences** — what this makes easier or harder

---

## D-012 — PUSH field removed from TASKS.md

- **Date:** 2026-04-14
- **Context:** Discovery that the `PUSH` field (auto/gate/manual) was parsed, stored in SQLite, and displayed in `noxdev log`, but no code anywhere branched on its value. The three-tier push model was documented in the README, playbook, and design doc for months — and never implemented. Agent committed its work regardless of PUSH value.
- **Decision:** Remove the field end-to-end. Parser silently ignores legacy `PUSH:` lines in existing TASKS.md files (forward compatibility). Schema migrates away the `push_mode` column. README drops the three-tier section.
- **Alternatives considered:**
  - *Implement the original intent.* Rejected because it contradicts the same principle that killed `noxdev merge` (decision D-011): spec-driven workflows don't need per-commit review gates.
  - *Keep as cosmetic metadata.* Rejected because fields that look like behavior but do nothing are a trap — every future reader assumes they mean something.
- **Consequences:**
  - TASKS.md specs become shorter by one line
  - One less thing to document honestly
  - Eugene continues to merge manually via `git merge noxdev/<project>` + `git push` as he has been doing

## D-011 — `noxdev merge` removed

- **Date:** 2026-04-14
- **Context:** The merge command (interactive approve/reject per commit) was built around an assumed workflow — per-commit human review — that Eugene has never actually used and doesn't want to. His actual workflow is `git merge noxdev/<project>`. The entire merge machinery (command, dashboard page, `merge_decision`/`merged_at` columns, approve/reject buttons) was solving a problem that doesn't exist in spec-driven development.
- **Decision:** Delete `noxdev merge` entirely. No wrapper, no convenience command. Delete the dashboard merge review page, the approve/reject UI on task detail, the merge badges on task rows, the API routes, and the two SQLite columns. Document the workflow as plain `git merge` in the README.
- **Alternatives considered:**
  - *Keep as thin git wrapper.* Rejected because Eugene doesn't want a shortcut for a command he types once per project per day.
  - *Keep the dashboard review page only.* Rejected because approval buttons that only update SQLite (not actual git) were actively misleading users.
- **Consequences:**
  - Dashboard focuses on observability, not workflow
  - v1.2.0 ships as a "noxdev does less" release — simpler is the right direction for a tool whose value is simplicity
  - In spec-driven development, the spec *is* the review — diff review after the fact is a category error from a world where humans wrote the code

## D-010 — VERIFY enforcement deferred; prompt tweak only

- **Date:** 2026-04-14
- **Context:** Discovered that VERIFY fields in TASKS.md were never actually executed. They were passed to the agent as prompt text, and the agent self-reported pass/fail with narrative like "✅ Code syntax is valid" instead of running the command. Every task completion to date was unverified.
- **Decision:** Ship a prompt tweak only. The agent is now instructed to execute VERIFY as a real shell command and report exit code honestly. No run-engine enforcement. No separate verify container.
- **Alternatives considered:**
  - *Fresh verify container after agent.* Rejected — double work (e.g., `uv sync` runs twice), loses agent's ephemeral state, breaks reproducibility with the working flow.
  - *Keep container alive and `docker exec` verify post-agent.* Rejected for now because the severity didn't match the cost; VERIFY is a sanity check, not the trust boundary.
  - *Trust model of agent self-report with structured output.* Rejected because we just discovered we can't trust agent self-report.
- **Consequences:**
  - The real quality gates remain: agent iteration, critic (once its own bugs are fixed), morning review, project test suite
  - Real enforcement remains an option for later when external users or a real failure warrants it
  - Decision recorded so we don't re-litigate this in 3 months

## D-009 — Doc-driven development as the primary methodology

- **Date:** 2026-04-14
- **Context:** Recurring failures in planning quality traced to writing specs from partial context. AI execution made code production cheap, but decision quality became the bottleneck. Eugene's insight: solo dev with AI is not "solo dev with extra rigor," it's normal engineering where the production workforce is elastic.
- **Decision:** Adopt a formal artifact hierarchy — Architecture → Roadmap → Feature Specs → TASKS.md + Decisions → audit artifacts — with templates committed to the noxdev repo. Treat documents as first-class artifacts; code is the emergent result. No distinction between solo-dev process and commercial team process.
- **Alternatives considered:**
  - *Informal note-taking across session handoffs.* Rejected because this is what was failing — handoffs drifted into serving as architecture docs by default.
  - *Wait until after v1.2.0 ships.* Rejected because the current session's planning failures were directly caused by missing this structure.
- **Consequences:**
  - Part 3 (debugging existing code) gets a new workflow: Claude CLI audit → Claude Project planning → noxdev execution
  - Planning time increases, debugging time decreases, net cycle time drops
  - Templates ship with noxdev, so other users adopt the same discipline

## D-008 — Critic diff capture uses pre-task SHA, not HEAD

- **Date:** 2026-04-14
- **Context:** Critic was rejecting valid work repeatedly. Traced to `git diff HEAD` in `docker-capture-diff.sh` — this diffs working tree against last commit, but the agent's work *is* the last commit, so the diff showed only uncommitted noise (typically TASKS.md status edits).
- **Decision:** Script takes a third argument `pre_task_sha`. Diffs `$pre_task_sha..HEAD` to capture committed work. Also includes uncommitted section for completeness. Empty-diff guardrail in orchestrator skips critic if only TASKS.md changed.
- **Alternatives considered:**
  - *Reorder: run critic before TASKS.md update.* Rejected because the root cause was the query, not the ordering; fixing ordering would have left a latent bug for any other workflow that touches the worktree.
  - *Parse the agent's commit directly.* Rejected as more complex than a SHA range diff.
- **Consequences:**
  - Critic reviews real work for the first time
  - Earlier "false rejections" Eugene manually overrode were all this same bug
  - Chicken-and-egg cases (task fixes the critic) still need `CRITIC: skip`, but that's documented

## D-007 — v1.0.6 killed, rolled into v1.2.0 — 2026-04-13

Cost dashboard was long planned as v1.2.0. The v1.0.6 scope shrank to "delete merge + small verify fix" which didn't justify a dedicated minor. Bundled everything into v1.2.0 instead. Semver allows skipping minors. No reason to ship two releases when one suffices.

---

## Backfilled decisions (earlier sessions, retroactively captured)

## D-006 — Promote, don't rewrite — 2026-03-22

Battle-tested bash Docker orchestration survived 70+ runs with zero containment failures. TypeScript CLI wraps and invokes the bash scripts rather than reimplementing container management. Every rewrite attempt introduced bugs. Applied to Docker lifecycle, credential restore, diff capture.

## D-005 — No auto-push, ever — 2026-03-22

Commits stay on the worktree branch until human review. Even in PUSH: auto mode, the push target is the worktree, not origin. Whether the code leaves the machine is always a human decision. (Note: the PUSH field itself was removed in D-012, but the underlying principle holds — the worktree-to-main boundary is the human checkpoint.)

## D-004 — Docker containment is non-negotiable — 2026-03-15

Origin: a Claude Code session generated a 35GB log file on disk. Docker is the hard boundary. Memory limits, CPU limits, disk limits, timeouts — all architectural requirements, not optional.

## D-003 — Max-first auth with API fallback — 2026-03-18

Claude Max subscription covers free Opus compute overnight. API key as fallback for daily cap or rate-limit situations. Minimizes cost, uses the best available model when possible.

## D-002 — Awake = learning, asleep = automation — 2026-03-20

Eugene's active hours are for hands-on practice, manual work, skill building, and decisions. noxdev's automated execution happens while he sleeps. Principle: don't use AI for the things that build intuition, use it for the things that would otherwise eat your time.

## D-001 — Spec-driven development as the primary model — 2026-03-10

Tasks defined by markdown specs with explicit stopping conditions (VERIFY). Directive over exploratory. Dependencies between tasks made explicit. Session gates between phases. Established early and proven across 70+ tasks. Doc-driven development (D-009) is a generalization of this to all artifacts, not just tasks.
