#!/usr/bin/env bash
# =============================================================================
# BABASITARAM PRO — Build Script
# Usage:
#   bash scripts/build.sh chrome    → dist/chrome/ + babasitaram-pro-chrome-*.zip
#   bash scripts/build.sh firefox   → dist/firefox/ + babasitaram-pro-firefox-*.zip
#   bash scripts/build.sh all       → both
# =============================================================================
set -euo pipefail

VERSION=$(python3 -c "import json; m=json.load(open('src/chrome/manifest.json')); print(m['version'])")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
SHARED="$ROOT/src/shared"

SHARED_FILES=(
  popup.js popup.html
  content.js
  password-guard.js
  element-picker.js
  custom-rules-inject.js
  filter-sync.js
  filter-list-worker.js
  newtab.js newtab.html
  utils.js
  settings.js settings.html
  focus-mode.js focus-mode.html focus-mode-page.js
  focus-blocked.js focus-blocked.html
  vault-blocked.js vault-blocked.html
  timelimit.js timelimit.html
  burn.js burn.html
  burned.js burned.html
  blocked.js blocked.html
  onboarding.js onboarding.html
  restore.js restore.html
  rules.json
  icon.png icon16.png icon32.png icon48.png icon128.png
)

build_chrome() {
  echo "🔨 Building Chrome package (v$VERSION)..."
  TARGET="$DIST/chrome"
  rm -rf "$TARGET" && mkdir -p "$TARGET"

  for f in "${SHARED_FILES[@]}"; do
    cp "$SHARED/$f" "$TARGET/" && echo "  ✓ $f"
  done

  cp "$ROOT/src/chrome/background.js" "$TARGET/background.js" && echo "  ✓ background.js (Chrome)"
  cp "$ROOT/src/chrome/manifest.json" "$TARGET/manifest.json" && echo "  ✓ manifest.json (Chrome)"

  # Validate manifest
  python3 -c "import json; m=json.load(open('$TARGET/manifest.json')); assert 'service_worker' in m['background'], 'service_worker missing'; assert 'scripts' not in m['background'], 'scripts must not be in Chrome manifest'" && echo "  ✓ Manifest validated"

  # Create ZIP
  ZIP="$ROOT/babasitaram-pro-chrome-$VERSION.zip"
  (cd "$DIST" && zip -r "$ZIP" chrome/ -x "*/.*") && echo "  ✓ $ZIP created"
  echo ""
  echo "✅ Chrome build complete → dist/chrome/ + babasitaram-pro-chrome-$VERSION.zip"
}

build_firefox() {
  echo "🦊 Building Firefox package (v$VERSION)..."
  TARGET="$DIST/firefox"
  rm -rf "$TARGET" && mkdir -p "$TARGET"

  for f in "${SHARED_FILES[@]}"; do
    cp "$SHARED/$f" "$TARGET/" && echo "  ✓ $f"
  done

  cp "$ROOT/src/firefox/background.js" "$TARGET/background.js" && echo "  ✓ background.js (Firefox)"
  cp "$ROOT/src/firefox/manifest.json" "$TARGET/manifest.json" && echo "  ✓ manifest.json (Firefox)"

  # Validate manifest
  python3 -c "import json; m=json.load(open('$TARGET/manifest.json')); assert 'scripts' in m['background'], 'scripts missing'; assert 'service_worker' not in m['background'], 'service_worker must not be in Firefox manifest'; assert m['browser_specific_settings']['gecko']['strict_min_version'] >= '142.0', 'min version too low'" && echo "  ✓ Manifest validated"

  # Validate Firefox background has NO getMatchedRules
  COUNT=$(grep -c "getMatchedRules" "$TARGET/background.js" || true)
  if [ "$COUNT" -gt 0 ]; then
    echo "  ✗ ERROR: background.js contains getMatchedRules ($COUNT occurrences) — AMO will reject this!"
    exit 1
  fi
  echo "  ✓ getMatchedRules check: CLEAN (0 occurrences)"

  # Validate NO innerHTML assignments in any JS
  IH=$(grep -rl "\.innerHTML\s*=" "$TARGET"/*.js 2>/dev/null || true)
  if [ -n "$IH" ]; then
    echo "  ✗ WARNING: innerHTML assignment found in: $IH"
  else
    echo "  ✓ innerHTML check: CLEAN"
  fi

  # Create ZIP
  ZIP="$ROOT/babasitaram-pro-firefox-$VERSION.zip"
  (cd "$DIST" && zip -r "$ZIP" firefox/ -x "*/.*") && echo "  ✓ $ZIP created"
  echo ""
  echo "✅ Firefox build complete → dist/firefox/ + babasitaram-pro-firefox-$VERSION.zip"
}

case "${1:-all}" in
  chrome)  build_chrome ;;
  firefox) build_firefox ;;
  all)     build_chrome && echo "" && build_firefox ;;
  *)       echo "Usage: $0 [chrome|firefox|all]" && exit 1 ;;
esac
