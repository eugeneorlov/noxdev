# DECISIONS.md

Append-only record of significant decisions. Newest entries at the top. Never edit old entries — if a later decision supersedes an earlier one, add a new entry referencing the old one.

## Format

Each entry follows this structure:

```
## D-NNN — <one-line title>

- **Date:** YYYY-MM-DD
- **Context:** What prompted the decision. What problem or discovery forced a choice.
- **Decision:** What was decided, stated directly.
- **Alternatives considered:** What was rejected and the one-line reason for each.
- **Consequences:** What this makes easier, harder, or possible. What follows from it.
- **Supersedes:** D-XXX (if this decision overrides an earlier one)
```

## Rules

1. **One decision per entry.** If you're documenting three related decisions, write three entries.
2. **Date at time of decision, not time of writing.** Backfilled entries use the actual decision date.
3. **Never edit old entries.** If something changes, write a new entry that supersedes.
4. **Link from other docs.** When ARCHITECTURE.md or a feature spec mentions a trade-off, reference the decision ID (e.g., "See D-005").
5. **Include rejected alternatives.** The "why not" is often more valuable than the "why" — it prevents re-litigating in three months.

## When to write an entry

Write an entry when:
- A choice closes off alternatives in a non-trivial way
- A principle is established that will guide future decisions
- A feature is deliberately deferred or killed
- A rewrite or major refactor is committed to (or rejected)
- An invariant is adopted that affects multiple components

Don't write an entry for:
- Routine implementation choices (variable names, function signatures)
- Temporary workarounds that will be revisited
- Preferences that are easily reversible

## Starter entries

(Add your first decisions below this line. Number them starting from D-001.)

---

## D-001 — <first decision>

- **Date:** YYYY-MM-DD
- **Context:**
- **Decision:**
- **Alternatives considered:**
- **Consequences:**
