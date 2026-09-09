#!/usr/bin/env bash
# BABASITARAM PRO — Compliance Validator
# Usage: bash scripts/validate.sh
PASS=0; FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

check_cmd() {
  local desc="$1"; shift
  if "$@" > /dev/null 2>&1; then ok "$desc"; else fail "$desc"; fi
}

# Count non-comment occurrences of a pattern (robust: || true prevents exit on no-match)
count_pat() {
  local pat="$1"; shift
  local n
  n=$(grep -rn "$pat" "$@" 2>/dev/null | grep -v ":[[:space:]]*//" || true)
  echo "${n}" | grep -c "." 2>/dev/null || echo 0
}

JS_SHARED="src/shared/popup.js src/shared/content.js src/shared/password-guard.js src/shared/element-picker.js src/shared/newtab.js src/shared/utils.js src/shared/filter-sync.js"
JS_CHROME="src/chrome/background.js"
JS_FIREFOX="src/firefox/background.js"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  BABASITARAM PRO — Compliance Validator"
echo "═══════════════════════════════════════════════════════"

echo ""
echo "── Manifest Validation ─────────────────────────────────"
check_cmd "Chrome manifest valid JSON"   python3 -c "import json; json.load(open('src/chrome/manifest.json'))"
check_cmd "Firefox manifest valid JSON"  python3 -c "import json; json.load(open('src/firefox/manifest.json'))"
check_cmd "Chrome: service_worker only" python3 -c "import json; m=json.load(open('src/chrome/manifest.json')); assert 'service_worker' in m['background'] and 'scripts' not in m['background']"
check_cmd "Firefox: scripts only"       python3 -c "import json; m=json.load(open('src/firefox/manifest.json')); assert 'scripts' in m['background'] and 'service_worker' not in m['background']"
check_cmd "Firefox min_version 142.0"  python3 -c "import json; m=json.load(open('src/firefox/manifest.json')); assert m['browser_specific_settings']['gecko']['strict_min_version'] >= '142.0'"
check_cmd "Firefox gecko.id present"    python3 -c "import json; m=json.load(open('src/firefox/manifest.json')); assert m['browser_specific_settings']['gecko']['id']"
check_cmd "Both manifests MV3"          python3 -c "import json; assert json.load(open('src/chrome/manifest.json'))['manifest_version']==3 and json.load(open('src/firefox/manifest.json'))['manifest_version']==3"

echo ""
echo "── Firefox AMO Critical ─────────────────────────────────"
if grep -q "getMatchedRules" "$JS_FIREFOX" 2>/dev/null; then
  fail "getMatchedRules in Firefox background — AMO WILL REJECT"
else
  ok "getMatchedRules absent from Firefox background"
fi

echo ""
echo "── Security Scan ────────────────────────────────────────"
if grep -rn '\.innerHTML[[:space:]]*=' $JS_SHARED $JS_CHROME $JS_FIREFOX 2>/dev/null | grep -qv ":[[:space:]]*//" ; then
  fail "innerHTML assignment found (unsafe)"
else
  ok "Zero innerHTML assignments"
fi

if grep -rn 'createContextualFragment' $JS_SHARED $JS_CHROME $JS_FIREFOX 2>/dev/null | grep -qv ":[[:space:]]*//" ; then
  fail "createContextualFragment found"
else
  ok "Zero createContextualFragment calls"
fi

if grep -rn '[^a-zA-Z]eval(' $JS_SHARED $JS_CHROME $JS_FIREFOX 2>/dev/null | grep -qv ":[[:space:]]*//" ; then
  fail "eval() call found"
else
  ok "Zero eval() calls"
fi

if grep -rn 'new Function(' $JS_SHARED $JS_CHROME $JS_FIREFOX 2>/dev/null | grep -qv ":[[:space:]]*//" ; then
  fail "new Function() found"
else
  ok "Zero new Function() calls"
fi

if grep -rn 'document\.write(' $JS_SHARED $JS_CHROME $JS_FIREFOX 2>/dev/null | grep -qv ":[[:space:]]*//" ; then
  fail "document.write() found"
else
  ok "Zero document.write() calls"
fi

echo ""
echo "── Syntax Checks ────────────────────────────────────────"
for f in $JS_SHARED $JS_CHROME $JS_FIREFOX; do
  check_cmd "Syntax: $f" node --check "$f"
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RESULT: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════"
echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Validation FAILED"
  exit 1
else
  echo "✅ All checks passed — ready for store submission!"
fi
