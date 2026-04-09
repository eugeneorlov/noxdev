# noxdev demo — your first autonomous build

# This is a baked-in demo task spec shipped with noxdev.
# It transforms a fresh Vite + React + TypeScript scaffold into a
# polished welcome page, built entirely by an autonomous agent.
#
# Estimated runtime: 2-3 minutes total
# Gate: pnpm build must pass after each task

## T1: Replace the Vite starter App with a noxdev welcome page
- STATUS: pending
- FILES: src/App.tsx, src/App.css
- VERIFY: pnpm build && grep -q "noxdev" src/App.tsx && ! grep -q "viteLogo" src/App.tsx
- CRITIC: skip
- PUSH: auto
- SPEC: Replace the contents of src/App.tsx and src/App.css to create a
  centered welcome page that demonstrates noxdev's spec-driven workflow.

  REQUIREMENTS for src/App.tsx:
  - Remove ALL Vite starter content: viteLogo import, reactLogo import,
    useState counter, the entire default JSX with logos and counter button.
  - Do NOT keep any reference to viteLogo, reactLogo, or the count state.
  - Replace with a single functional component that renders:
    - A main container div with className "app-container"
    - An owl emoji 🦉 inside a div with className "app-owl"
    - An h1 with the text "noxdev demo"
    - A subtitle paragraph with className "app-subtitle":
      "This page was built by an autonomous agent while you watched."
    - A "What just happened" section with className "app-explainer":
      - h2 with text "What just happened?"
      - A paragraph explaining: "You ran one command. noxdev spun up a
        Docker container, fed a task spec to Claude Code, captured the
        diff, and committed the result. No clicks. No typing. Just specs."
    - A footer paragraph with className "app-footer":
      "Welcome to spec-driven development."

  REQUIREMENTS for src/App.css:
  - Replace the ENTIRE file. Remove all default Vite styles.
  - Use CSS variables at the top for the color palette:
    --bg: #0a0a12 (deep near-black)
    --surface: #161623
    --text: #e4e4ef
    --muted: #9494a8
    --gold: #C9A84C (noxdev brand color)
    --border: #2a2a3e
  - Body / .app-container styles:
    - body: background var(--bg), color var(--text), system font stack
      (-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
    - margin 0, min-height 100vh
    - .app-container: max-width 640px, margin 0 auto, padding 80px 24px,
      text-align center
  - .app-owl: font-size 80px, margin-bottom 24px, line-height 1
  - h1: font-size 48px, font-weight 700, color var(--gold),
    margin 0 0 16px 0, letter-spacing -0.02em
  - .app-subtitle: font-size 18px, color var(--muted), margin 0 0 64px 0,
    line-height 1.5
  - .app-explainer: background var(--surface), border 1px solid var(--border),
    border-radius 12px, padding 32px, margin-bottom 48px, text-align left
  - .app-explainer h2: font-size 20px, color var(--gold),
    margin 0 0 12px 0, font-weight 600
  - .app-explainer p: font-size 15px, color var(--text), margin 0,
    line-height 1.6
  - .app-footer: font-size 14px, color var(--muted), font-style italic,
    margin 0

  Do NOT add any imports beyond React. Do NOT add useState, useEffect,
  or any hooks. This is a purely static welcome page.
  Do NOT delete src/main.tsx or src/index.css — leave those alone.

## T2: Clean up Vite starter assets
- STATUS: pending
- FILES: src/index.css, public/vite.svg, src/assets/react.svg
- VERIFY: pnpm build && ! grep -q "vite.svg" index.html
- CRITIC: skip
- PUSH: auto
- SPEC: Remove the leftover Vite starter assets and update index.css.

  STEPS:
  1. Replace the contents of src/index.css with a minimal reset:
```css
     :root {
       font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                    Roboto, Oxygen, Ubuntu, sans-serif;
       line-height: 1.5;
       font-weight: 400;
       color-scheme: dark;
     }
     * {
       box-sizing: border-box;
     }
     body {
       margin: 0;
       min-width: 320px;
       min-height: 100vh;
     }
```
  2. Delete the file public/vite.svg (it is no longer used).
     Use rm public/vite.svg
  3. Delete the file src/assets/react.svg (it is no longer used).
     Use rm src/assets/react.svg
  4. If src/assets/ is now empty, remove it with rmdir src/assets
  5. Update index.html in the project root: change the <link rel="icon">
     line from href="/vite.svg" to href="data:," (an empty data URI).
     This removes the broken favicon reference without needing a new file.
  6. Update the <title> in index.html from "Vite + React + TS" to
     "noxdev demo".

  Do NOT touch src/main.tsx, package.json, vite.config.ts, or tsconfig.json.

## T3: Add a brief README explaining what noxdev built
- STATUS: pending
- FILES: README.md
- VERIFY: pnpm build && grep -q "noxdev" README.md
- CRITIC: skip
- PUSH: auto
- SPEC: Replace the default Vite README.md with a short explanation of
  what just happened in this demo.

  Replace the entire contents of README.md with exactly this markdown:

  # noxdev demo

  This project was built by an autonomous agent using
  [noxdev](https://github.com/eugeneorlov/noxdev).

  ## What happened

  You ran `noxdev demo`. noxdev:

  1. Scaffolded a fresh Vite + React + TypeScript project
  2. Initialized a git repository with an initial commit
  3. Registered the project with noxdev
  4. Spun up a Docker container with Claude Code inside
  5. Fed a task spec to the agent
  6. Captured the resulting diff
  7. Committed the changes to a worktree branch

  All without you typing a single line of code.

  ## Run it locally

```bash
  pnpm install
  pnpm dev
```

  Open http://localhost:5173 in your browser.

  ## What is spec-driven development?

  Instead of writing code, you write specifications. A specification
  describes what the agent should build, which files to touch, and how
  to verify the result. The agent reads the spec and produces code.

  See `TASKS.md` in the project root for the specs that built this page.

  ## Next steps

  - Edit `TASKS.md` to add your own task
  - Run `noxdev run noxdev-demo` to execute new tasks
  - Run `noxdev dashboard` to see the visual review interface
  - Read the noxdev docs to learn the full workflow

  ---

  *Built with noxdev. Ship code while you sleep.* 🦉

  Do NOT touch any other files.
