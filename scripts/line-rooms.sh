#!/bin/bash
# LINE room search script
# Fetch room list from Matrix bridge on VPS and search by name
#
# Usage:
#   line-rooms.sh              # list all rooms
#   line-rooms.sh "name"       # search by name (partial match)
#   line-rooms.sh --id "!abc"  # room details by room_id

set -euo pipefail

VPS_HOST="${VPS_HOST:-YOUR_VPS_HOST}"
SSH_OPTS="-o ConnectTimeout=15 -o ServerAliveInterval=10 -o StrictHostKeyChecking=no"
TOKEN="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
MAX_RETRIES=2

run_ssh() {
  local attempt=0
  while [ $attempt -le $MAX_RETRIES ]; do
    if output=$(ssh $SSH_OPTS "$VPS_HOST" "$1" 2>&1); then
      echo "$output"
      return 0
    else
      local exit_code=$?
      if [ $exit_code -eq 255 ] && [ $attempt -lt $MAX_RETRIES ]; then
        attempt=$((attempt + 1))
        echo "SSH retry ($attempt/$MAX_RETRIES)..." >&2
        sleep 10
      else
        echo "$output" >&2
        return $exit_code
      fi
    fi
  done
}

QUERY="${1:-}"

if [ "$QUERY" = "--id" ] && [ -n "${2:-}" ]; then
  # Get room details by room_id
  ROOM_ID="$2"
  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$ROOM_ID'))")
  run_ssh "curl -s 'http://127.0.0.1:8008/_synapse/admin/v1/rooms/${ENCODED}' -H 'Authorization: Bearer $TOKEN'"
else
  # List rooms + search
  run_ssh "curl -s 'http://127.0.0.1:8008/_synapse/admin/v1/rooms?limit=200' -H 'Authorization: Bearer $TOKEN'" | python3 -c "
import json, sys

query = '''$QUERY'''.strip()
data = json.load(sys.stdin)
rooms = data.get('rooms', [])

results = []
for r in rooms:
    name = r.get('name') or ''
    if not name:
        continue
    if query and query.lower() not in name.lower():
        continue
    results.append({
        'room_id': r['room_id'],
        'name': name,
        'members': r.get('joined_members', 0),
    })

# Sort: exact match first, then by member count (fewer = more likely 1:1 DM)
results.sort(key=lambda x: (0 if x['name'] == query else 1, x['members']))

if not results:
    print('No rooms found' + (f' matching \"{query}\"' if query else ''))
    sys.exit(1)

print(json.dumps(results, ensure_ascii=False, indent=2))
"
fi
