# noxdev Fix: Revert to SVG owl in dashboard header

## T1: Revert dashboard header logo from PNG to inline SVG
- STATUS: done
- FILES: packages/dashboard/src/components/Layout.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "C9A84C" packages/dashboard/src/components/Layout.tsx && ! grep -q "noxdev_owl.png" packages/dashboard/src/components/Layout.tsx
- CRITIC: skip
- PUSH: auto
- SPEC: The PNG owl logo (noxdev_owl.png) is too small at icon size in the
  dashboard header. Revert to an inline SVG owl that works at 32x32 and
  adapts to dark mode via currentColor.
  In packages/dashboard/src/components/Layout.tsx, find the img tag in the
  header that references noxdev_owl.png. It looks like this:
  ```tsx
  <img
    src="/noxdev_owl.png"
    alt="noxdev owl"
    className="h-8 w-8 rounded-full"
  />
  ```
  Replace that entire img tag with this EXACT inline SVG:
  ```tsx
  <svg className="h-8 w-8" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 6 L10 2 L12 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 6 L22 2 L24 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="11" cy="14" r="5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="11" cy="14" r="3" fill="#C9A84C"/>
    <circle cx="11" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="21" cy="14" r="5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="21" cy="14" r="3" fill="#C9A84C"/>
    <circle cx="21" cy="14" r="1.5" fill="currentColor"/>
    <path d="M16 20 L14 24 L18 24 Z" fill="currentColor"/>
  </svg>
  ```
  This SVG has: circle face, ear tufts, two eyes with gold (#C9A84C) irises,
  currentColor pupils, and a beak. Uses currentColor throughout so it
  automatically adapts to light and dark mode.
  Note: all SVG attributes MUST use React camelCase — strokeWidth not
  stroke-width, strokeLinecap not stroke-linecap, strokeLinejoin not
  stroke-linejoin. The code above already uses the correct casing.
  Do NOT remove noxdev_owl.png from packages/dashboard/public/ — keep it
  for README banner, LinkedIn, HN, and landing page.
  Do NOT change routing, nav links, ThemeToggle, or any other Layout behavior.
  Only replace the img tag with the inline SVG.
