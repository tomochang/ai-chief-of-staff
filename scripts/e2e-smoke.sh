#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

MOCK_BIN="$TMP_DIR/bin"
WORKSPACE_DIR="$TMP_DIR/workspace"
mkdir -p "$MOCK_BIN" "$WORKSPACE_DIR/private"

cat >"$MOCK_BIN/gog" <<EOF
#!/usr/bin/env bash
if [[ "\$1 \$2 \$3" == "calendar list primary" ]]; then
  cat "$ROOT_DIR/tests/fixtures/calendar-events.json"
  exit 0
fi
if [[ "\$1 \$2" == "calendar events" ]]; then
  cat <<'OUT'
2026-03-02 11:00-12:00 Tanaka sync
OUT
  exit 0
fi
echo "unsupported mock gog command: \$*" >&2
exit 1
EOF
chmod +x "$MOCK_BIN/gog"

cat >"$WORKSPACE_DIR/private/relationships.md" <<'EOF'
- Tanaka: discussed pricing proposal
EOF

cat >"$WORKSPACE_DIR/private/todo.md" <<'EOF'
- [ ] Follow up with Tanaka about contract review
EOF

export PATH="$MOCK_BIN:$PATH"
export WORKSPACE="$WORKSPACE_DIR"

calendar_output="$TMP_DIR/calendar.json"
node "$ROOT_DIR/scripts/calendar-suggest.js" --from 2026-03-02 --to 2026-03-03 --json >"$calendar_output"

jq -e '.slots | length > 0' "$calendar_output" >/dev/null
jq -e '.compact | test("Mon")' "$calendar_output" >/dev/null

lookup_output="$TMP_DIR/context.txt"
bash "$ROOT_DIR/scripts/context-lookup.sh" "Tanaka" >"$lookup_output"

grep -q "relationships.md" "$lookup_output"
grep -q "pricing proposal" "$lookup_output"
grep -q "todo.md" "$lookup_output"
grep -q "Follow up with Tanaka" "$lookup_output"
grep -q "Tanaka sync" "$lookup_output"

echo "E2E smoke checks passed"
