# noxdev Owl Fixes

# Dependencies: Phase F complete (or at least Phase E merged to main)
# Gate: pnpm build && noxdev (check ASCII alignment) && noxdev dashboard (check PNG logo)
#
# Session 1: T1 (ASCII fix — quick), T2 (dashboard PNG logo)
#
# IMPORTANT: Include working code inline in SPEC fields.
# Agents will invent new patterns if they don't see the battle-tested originals.

## T1: Fix ASCII owl alignment in CLI banner
- STATUS: done
- FILES: packages/cli/src/index.ts
- VERIFY: pnpm build && node packages/cli/dist/index.js 2>&1 | head -10
- CRITIC: skip
- PUSH: auto
- SPEC: Fix the ASCII owl art alignment in the CLI banner. The owl body is
  shifted left relative to the feet. Each line of the owl should be centered
  so the figure forms a proper pyramid shape with feet widest at the bottom.
  Find the ASCII owl string in packages/cli/src/index.ts (it's displayed when
  the user runs `noxdev` with no subcommand). Replace the current owl art with
  this EXACT string — do not modify the characters, only the leading spaces:
  ```
      ,___,
      [O.O]         noxdev v${version}
     /)   )\\        ship code while you sleep
     " \\|/ "
    ---m-m---
  ```
  The alignment rules (character count of leading spaces):
  - Line 1 `  ,___,`        — 4 spaces before comma
  - Line 2 `  [O.O]`        — 4 spaces before bracket
  - Line 3 ` /)   )\`       — 3 spaces before slash
  - Line 4 ` " \|/ "`       — 3 spaces before quote
  - Line 5 `---m-m---`      — 2 spaces before dash
  Each line gets 1 fewer leading space as it gets wider, creating a centered pyramid.
  The version text and tagline are right-aligned to the owl on lines 2 and 3.
  Make sure backslashes are properly escaped in the template literal.
  Do NOT change any other code in index.ts. Only modify the ASCII art string.

## T2: Replace SVG owl with PNG logo in dashboard header
- STATUS: done
- FILES: packages/dashboard/src/App.tsx, packages/dashboard/public/noxdev_owl.png
- VERIFY: cd packages/dashboard && pnpm build && ls public/noxdev_owl.png
- CRITIC: skip
- PUSH: auto
- SPEC: Replace the inline SVG owl logo in the dashboard header with the PNG
  logo file. The PNG is a high-quality owl-on-dark-circle design that looks
  great in both light and dark mode (it has its own dark background built in).
  Step 1: The file noxdev_owl.png must be placed at packages/dashboard/public/noxdev_owl.png.
  If it's not already there, the user will copy it manually before running this task.
  This task assumes the file exists at that path.
  Step 2: In packages/dashboard/src/App.tsx, find the owl logo in the header.
  It is currently either:
  - An inline SVG component (the owl drawn with SVG paths), OR
  - An <img> tag pointing to /owl-logo.svg
  Replace it with:
  ```tsx
  <img
    src="/noxdev_owl.png"
    alt="noxdev owl"
    className="h-8 w-8 rounded-full"
  />
  ```
  Place this inside the header, to the left of the "noxdev" text.
  The rounded-full class makes the circular logo look clean at small sizes.
  h-8 w-8 = 32px, which matches typical header icon sizing.
  Step 3: Keep the old SVG owl in the footer if there is a footer.
  If the footer currently has text like "noxdev — ship code while you sleep",
  add the old SVG owl (small, 16x16) next to it. If converting the SVG to
  work in dark mode is needed, just add `className="dark:invert"` to the
  SVG or img tag in the footer. The footer owl is decorative, not critical.
  If there is no footer SVG currently, skip this — don't add one.
  Step 4: Remove the old owl-logo.svg file import or inline SVG code from
  the header section. Keep the file packages/dashboard/public/owl-logo.svg
  in place (don't delete it) in case it's referenced elsewhere.
  Do NOT change routing, nav links, ThemeToggle, or any other header behavior.
  Only swap the logo image source.
