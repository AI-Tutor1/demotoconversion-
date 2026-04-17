#!/usr/bin/env bash
# One-time installer — symlinks the versioned pre-push hook into .git/hooks/.
# Run once per fresh clone. Idempotent.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

src="$(pwd)/scripts/git-hooks/pre-push"
dst=".git/hooks/pre-push"

if [ ! -f "$src" ]; then
  echo "✗ source hook missing: $src"; exit 1
fi

# Remove any existing hook (sample file or previous install) then symlink.
[ -e "$dst" ] && rm "$dst"
ln -s "$src" "$dst"
chmod +x "$src"

echo "✓ Installed pre-push hook → $dst"
echo "  On every 'git push', this runs scripts/smoke.sh. Bypass once with --no-verify."
echo "  Uninstall: rm $dst"
