#!/bin/bash
set -e
echo "🦉 noxdev pre-publish verification"
echo "=================================="
echo ""
# 1. Clean build
echo "→ Clean build..."
pnpm build
echo "✓ Build passed"
echo ""
# 2. Check CLI dist contents
echo "→ Checking CLI dist contents..."
DIST="packages/cli/dist"
[ -f "$DIST/index.js" ] && echo "  ✓ index.js" || { echo "  ✗ index.js MISSING"; exit 1; }
[ -d "$DIST/scripts" ] && echo "  ✓ scripts/" || { echo "  ✗ scripts/ MISSING"; exit 1; }
[ -d "$DIST/dashboard" ] && echo "  ✓ dashboard/" || { echo "  ✗ dashboard/ MISSING"; exit 1; }
[ -f "$DIST/dashboard/index.html" ] && echo "  ✓ dashboard/index.html" || { echo "  ✗ dashboard/index.html MISSING"; exit 1; }
echo ""
# 3. Check package.json metadata
echo "→ Checking package metadata..."
cd packages/cli
NAME=$(node -e "console.log(require('./package.json').name)")
VERSION=$(node -e "console.log(require('./package.json').version)")
LICENSE=$(node -e "console.log(require('./package.json').license)")
echo "  name: $NAME"
echo "  version: $VERSION"
echo "  license: $LICENSE"
[ "$NAME" = "noxdev" ] || { echo "  ✗ package name should be 'noxdev'"; exit 1; }
[ "$LICENSE" = "MIT" ] || { echo "  ✗ license should be 'MIT'"; exit 1; }
echo ""
# 4. Pack and check tarball
echo "→ Creating tarball..."
npm pack --dry-run 2>&1
echo ""
# 5. Check README and LICENSE
cd ../..
[ -f "README.md" ] && echo "✓ README.md exists" || echo "✗ README.md MISSING"
[ -f "LICENSE" ] && echo "✓ LICENSE exists" || echo "✗ LICENSE MISSING"
[ -f "CHANGELOG.md" ] && echo "✓ CHANGELOG.md exists" || echo "✗ CHANGELOG.md MISSING"
echo ""
echo "🦉 Pre-publish checks complete!"
echo "To publish: cd packages/cli && npm publish"