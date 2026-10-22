#!/bin/bash
# Build the EMIS+ web preview and publish it to GitHub Pages
# (https://momominibot.github.io/emis-plus-app/, branch gh-pages).
# Keeps gh-pages history: each deploy is one new commit, never a force push.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_SHA=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain -- app components lib constants assets app.json package.json)" ]; then
  echo "Commit your app changes first so the deploy matches a commit." >&2
  exit 1
fi

scripts/build-web.sh

git fetch -q origin gh-pages
TMP=$(mktemp -d)
trap 'git worktree remove --force "$TMP" >/dev/null 2>&1 || true' EXIT
git worktree add -q --detach "$TMP" origin/gh-pages
# Keep earlier JS bundles: GitHub's CDN can serve a cached 404.html/index.html
# for ~10 minutes that still points at the previous bundle.
# Keep files other agents add to gh-pages on purpose (mobile.html = phone-frame preview).
rsync -a --delete --exclude .git --filter='P _expo/static/js/**' --filter='P mobile.html' dist/ "$TMP"/
cd "$TMP"
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed on gh-pages."
  exit 0
fi
git commit -q -m "Deploy web preview from $SRC_SHA"
git push -q origin HEAD:gh-pages
echo "Published $SRC_SHA to https://momominibot.github.io/emis-plus-app/"
