# Samples

Real-world `TASKS.md` examples you can adapt for your own `noxdev` runs.

Unlike the canned `noxdev demo` (which scaffolds and builds a fixed todo app), these
samples are full task specs reverse-engineered from working applications — useful as
references for how to break a real project into atomic, gated tasks.

## How to use a sample

1. Scaffold a base project and register it: `noxdev init <project> --repo <path>`.
2. Copy the sample into the worktree: `cp samples/<name>/TASKS.md ~/worktrees/<project>/TASKS.md`.
3. Pre-install dependencies (agents run offline in Docker — install npm/python deps first).
4. Run it: `noxdev run <project>`.

## Available samples

| Sample | Stack | Builds |
|--------|-------|--------|
| [`adv-ride-planner`](adv-ride-planner/TASKS.md) | FastAPI · SQLModel · SQLite / React · Vite · React Router · Leaflet · Tailwind | A fullstack adventure-ride planner: CRUD rides with ordered waypoints, an interactive map (OpenStreetMap, no API key), seed data, and tests. 7 tasks, backend-first, each with a VERIFY gate. |
