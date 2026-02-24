#!/bin/bash
# line-send.sh — LINE send + verification + auto status update
# Usage: line-send.sh <recipient name> <message>
#
# Flow:
# 1. Approval check
# 2. Room search
# 3. Send
# 4. Response verification (event_id check + error handling)
# 5. Auto status file update
# 6. Post-send task list

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: line-send.sh <name> <message>}"
MESSAGE="${2:?Usage: line-send.sh <name> <message>}"
DRAFT_FILE="$MSG_DRAFT_DIR/line-replies-$MSG_TODAY.md"

# 0. Approval check
msg_require_approval "$NAME" "$DRAFT_FILE"

# 1. Room search
echo "🔍 Room search: $NAME"
ROOM_ID=$(msg_search_matrix_room "$NAME")

if [ -z "$ROOM_ID" ]; then
  echo "❌ Room '$NAME' not found"
  exit 1
fi
echo "  → $ROOM_ID"

# 2. Join room
msg_join_matrix_room "$ROOM_ID"

# 3. Send
echo "📤 Sending..."
RESPONSE=$(msg_send_matrix "$ROOM_ID" "$MESSAGE" "line")

# 4. Response verification
EVENT_ID=$(msg_verify_matrix_response "$RESPONSE")

if [ $? -ne 0 ] || [ -z "$EVENT_ID" ]; then
  echo "❌ Send failed: $RESPONSE"
  echo ""
  echo "🔧 Please attempt recovery"
  exit 1
fi

echo "✅ Send success: $EVENT_ID"

# 5. Status file update
msg_update_status "$NAME" "$MSG_NOW_JST" "$DRAFT_FILE"

# 6. Trust event recording (Mesh Controller)
MESH_URL="${MESH_URL:-http://127.0.0.1:3001}"
MESH_TOKEN="${MESH_TOKEN:-}"
MESH_PARTICIPANT_ID="${MESH_PARTICIPANT_ID:-YOUR_MESH_PARTICIPANT_ID}"
if [ -n "$MESH_PARTICIPANT_ID" ]; then
  curl -sf -X POST "$MESH_URL/trust/$MESH_PARTICIPANT_ID/event" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MESH_TOKEN" \
    -d "{\"actionType\":\"message_send\",\"outcome\":\"success\",\"severity\":\"medium\",\"context\":{\"toolName\":\"line-send.sh\",\"target\":\"$NAME\",\"channel\":\"line\"}}" \
    > /dev/null 2>&1 && echo "📊 trust_event recorded" || echo "⚠️ trust_event recording failed (non-blocking)"
fi

# 7. Post-send task list
msg_show_post_send_checklist
