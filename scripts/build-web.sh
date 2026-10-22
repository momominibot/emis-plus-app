#!/bin/bash
# Build the EMIS+ web preview into dist/ exactly as it is published:
# single-page export, noindex on every page, 404.html deep-link fallback.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
EXPO_NO_TELEMETRY=1 CI=1 npx expo export -p web --output-dir dist
# The preview must not compete with emis.asia in search: noindex every page.
python3 - <<'PY'
import pathlib
p = pathlib.Path('dist/index.html'); s = p.read_text()
if 'name="robots"' not in s:
    s = s.replace('<head>', '<head><meta name="robots" content="noindex, nofollow" />', 1)
p.write_text(s)
PY
grep -q 'name="robots"' dist/index.html || { echo "noindex tag missing" >&2; exit 1; }
cp dist/index.html dist/404.html   # GitHub Pages serves 404.html for deep links
touch dist/.nojekyll               # keep folders that start with _ (Expo's _expo/)
python3 tools/contrast.py          # fail the build if any colour pair drops below AA
