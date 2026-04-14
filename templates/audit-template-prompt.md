# Audit Prompt Template for Claude CLI

Use this template when planning any cross-cutting change (Part 3 work). Run the audit via Claude CLI in the repo, then paste the resulting markdown artifact into Claude Project for spec planning.

## How to use

1. Copy the prompt below.
2. Replace `<CONCEPT>` with the thing being audited (column name, field name, feature, function, etc.).
3. Run via Claude CLI in the repo root.
4. Claude writes the audit file to `.audits/audit-<concept>-<date>.md` or similar.
5. Upload that file to the Claude Project that's planning the change.
6. Plan the TASKS.md with full surface area visible.

---

## The prompt

```
Audit task: enumerate all references to <CONCEPT> in this repository.

Output: a single markdown file at .audits/audit-<concept>-<YYYY-MM-DD>.md with the sections below. Create the .audits/ directory if it doesn't exist.

## Sections required

### 1. Summary
- Total references found
- Number of files touched
- Category breakdown (count per category)

### 2. References table
A markdown table with these columns:

| File | Line | Category | Context | Notes |

Where:
- File: relative path from repo root
- Line: the line number
- Category: one of { write, read, type, test, display, doc, dead }
- Context: the exact surrounding 1-3 lines of code, in a code block if multi-line
- Notes: anything relevant — ambiguity, cross-reference to another concept, migration risk

Category definitions:
- **write** — code that inserts, updates, or writes this concept (SQL INSERT, .set(), assignment to a stored field)
- **read** — code that queries or reads this concept (SELECT, property access, parser fields)
- **type** — TypeScript interfaces, types, SQL schema definitions
- **test** — any reference in a test file
- **display** — user-facing strings, log output, UI rendering
- **doc** — markdown files, comments, README
- **dead** — references that appear unused (declared but never read, for example)

### 3. Dependencies
- This concept depends on: (list other concepts that must exist for this one to work)
- This concept is depended on by: (list features that would break if this were removed)

### 4. Removal order
If this concept were being removed, what's the correct sequence to avoid breaking intermediate states? Number the steps. Example:
1. Stop writing new values (queries.ts, orchestrator.ts)
2. Stop reading (display code, dashboard)
3. Schema migration (drop column)
4. Documentation cleanup

### 5. Flagged risks
Any places where the audit found something unusual, ambiguous, or concerning. Examples:
- A reference that can't be cleanly categorized
- Code that appears to depend on this concept but through indirection
- Tests that might pass with the concept removed due to weak assertions

## Rules

1. **Enumerate only.** Do not propose changes. Do not suggest refactors. Do not fix anything.
2. **Include all file types.** TypeScript, SQL, Markdown, test files, config files, shell scripts, Dockerfiles.
3. **Include docs.** README.md, CHANGELOG.md, playbook markdown, comments. Docs count as references.
4. **Flag ambiguity.** If a reference could be categorized multiple ways, note both in the Notes column.
5. **Stop when the search is exhausted.** Do not explore adjacent concepts. Do not "while I was here, I also noticed..."
6. **Write the file, then exit.** Do not modify any source files. Do not run tests. Do not build.

## Search approach

- Use `grep -rn "<concept>" .` across the full repo (including tests and docs).
- Consider variations: snake_case, camelCase, PascalCase of the concept name.
- Consider related terms if the concept has synonyms (e.g., "merge_decision" and "mergeDecision" and "merged_at" together).

Expected output length: as much as needed. Do not truncate for brevity. A comprehensive audit is the whole point.
```

---

## When to run an audit

Run an audit before planning any of:
- Removing a field, column, or concept
- Renaming a concept or function that appears in multiple files
- Migrating a schema
- Changing the signature of a function called from multiple places
- Deleting a command or feature
- Splitting one concept into two, or merging two into one

Don't run an audit for:
- Adding a new feature (additive changes don't need surface area analysis)
- Single-file changes
- Changes to greenfield code that hasn't accumulated callers yet
- Quick bug fixes with a known, local scope

## Audit retention

- Store audits in `.audits/` directory in the repo (gitignored or committed — your choice).
- Name with date: `audit-<concept>-YYYY-MM-DD.md`
- Audits go stale fast. Re-run before planning a second round of changes to the same concept.
- Committed audits serve as historical documentation of the surface area at a point in time.
