# noxdev Fix: Revert to SVG owl in dashboard header

## T1: Revert dashboard header logo from PNG to inline SVG
- STATUS: done
- FILES: packages/dashboard/src/components/Layout.tsx
- VERIFY: cd packages/dashboard && pnpm build && grep -q "C9A84C" packages/dashboard/src/components/Layout.tsx
- CRITIC: skip
- PUSH: auto
- SPEC: The PNG owl logo (noxdev_owl.png) is too small at icon size in the
  dashboard header. Revert to the existing SVG owl from owl-logo.svg but as
  inline SVG so currentColor works for dark mode.
  In packages/dashboard/src/components/Layout.tsx, find the img tag in the
  header that references noxdev_owl.png:
  ```tsx
  <img
    src="/noxdev_owl.png"
    alt="noxdev owl"
    className="h-8 w-8 rounded-full"
  />
  ```
  Replace it with this EXACT inline SVG — do not modify the SVG paths:
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
  Note: SVG attributes must use React camelCase: strokeWidth, strokeLinecap,
  strokeLinejoin (not stroke-width, stroke-linecap, stroke-linejoin).
  Do NOT remove noxdev_owl.png from packages/dashboard/public/ — keep it
  for README, marketing, and landing page.
  Do NOT change routing, nav links, ThemeToggle, or any other header behavior.
