#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$ROOT_DIR/.githooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "ERROR: hooks directory not found: $HOOKS_DIR" >&2
  exit 1
fi

git -C "$ROOT_DIR" config core.hooksPath .githooks
chmod +x "$HOOKS_DIR"/* 2>/dev/null || true

echo "Git hooks enabled for this repo."
echo "hooksPath=$(git -C "$ROOT_DIR" config --get core.hooksPath)"
