#!/bin/bash
# messenger-send.sh — Messenger send + verification + auto status update
# Usage: messenger-send.sh <recipient name> <message> [--chrome]
#
# Default: Matrix bridge
# --chrome: Chrome AppleScript fallback (when bridge is down)
#
# Flow:
# 1. Approval check (status file verification)
# 2. Send (Matrix API or Chrome AppleScript)
# 3. Response verification
# 4. Auto status file update
# 5. Post-send task list

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: messenger-send.sh <name> <message> [--chrome]}"
MESSAGE="${2:?Usage: messenger-send.sh <name> <message> [--chrome]}"
MODE="matrix"
if [[ "${3:-}" == "--chrome" ]]; then
  MODE="chrome"
fi

DRAFT_FILE="$MSG_DRAFT_DIR/messenger-replies-$MSG_TODAY.md"
TRIAGE_FILE="${TRIAGE_DIR:-$WORKSPACE/private}/messenger_triage_$MSG_TODAY.md"

# 0. Approval check
msg_require_approval "$NAME" "$DRAFT_FILE" "$TRIAGE_FILE"

echo "📤 Messenger send: $NAME ($MODE mode)"
echo "=========================================="

if [ "$MODE" = "matrix" ]; then
  # ==================== Matrix Bridge ====================

  # 1. Room search (mautrix-meta rooms only — exclude LINE rooms)
  echo "🔍 Room search: $NAME"
  ROOM_ID=$(msg_search_matrix_room "$NAME" "linebot")

  if [ -z "$ROOM_ID" ]; then
    echo "❌ Room '$NAME' not found"
    echo "💡 Try --chrome option for Chrome AppleScript-based sending"
    exit 1
  fi
  echo "  → $ROOM_ID"

  # 2. Join room
  msg_join_matrix_room "$ROOM_ID"

  # 3. Send
  echo "📤 Sending (Matrix API)..."
  RESPONSE=$(msg_send_matrix "$ROOM_ID" "$MESSAGE" "messenger")

  # 4. Response verification
  EVENT_ID=$(msg_verify_matrix_response "$RESPONSE")

  if [ $? -ne 0 ] || [ -z "$EVENT_ID" ]; then
    echo "❌ Send failed: $RESPONSE"
    echo "💡 Try --chrome option for Chrome AppleScript-based sending"
    exit 1
  fi

  echo "✅ Send success: $EVENT_ID"

elif [ "$MODE" = "chrome" ]; then
  # ==================== Chrome AppleScript ====================
  # Prerequisite: Chrome with Messenger tab open on Mac + chat visible

  echo "⚠️ Chrome AppleScript sending: either run directly on Mac,"
  echo "   or use browser tool (profile=chrome) to operate."
  echo ""
  echo "📋 Manual steps:"
  echo "  1. Open '$NAME' chat in Messenger"
  echo "  2. Send the following message:"
  echo ""
  echo "---"
  echo "$MESSAGE"
  echo "---"
  echo ""
  echo "💡 AppleScript command (Mac Terminal):"
  cat << 'APPLESCRIPT'
osascript << 'EOF'
tell application "Google Chrome"
  -- Focus textbox
  execute tab TAB_NUM of window 1 javascript "
    (function() {
      var input = document.querySelector('[role=\"textbox\"][contenteditable=\"true\"]');
      if (input) { input.focus(); return 'ok'; }
      return 'no input';
    })()
  "
  delay 1
  -- Insert text
  execute tab TAB_NUM of window 1 javascript "
    (function() {
      var input = document.querySelector('[role=\"textbox\"][contenteditable=\"true\"]');
      if (!input) return 'no input';
      input.focus();
APPLESCRIPT
  echo "      document.execCommand('insertText', false, $(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$MESSAGE"));"
  cat << 'APPLESCRIPT'
      return input.innerText.substring(0, 80);
    })()
  "
  delay 1
  -- Send with Enter
  execute tab TAB_NUM of window 1 javascript "
    (function() {
      var input = document.querySelector('[role=\"textbox\"][contenteditable=\"true\"]');
      if (!input) return 'no input';
      input.focus();
      var e = new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true});
      input.dispatchEvent(e);
      return 'sent';
    })()
  "
end tell
EOF
APPLESCRIPT
  echo ""
  echo "⚠️ Replace TAB_NUM with your actual Messenger tab number"
  # Chrome-based requires manual confirmation
  echo ""
  read -p "Send completed? (y/n): " CONFIRM
  if [[ "$CONFIRM" != "y" ]]; then
    echo "❌ Send cancelled. Status not updated."
    exit 1
  fi
  echo "✅ Send complete (Chrome-based, manually confirmed)"
fi

# 5. Status file update
msg_update_status_any "$NAME" "$MSG_NOW_JST" "$DRAFT_FILE" "$TRIAGE_FILE"

# 6. Trust event recording (Mesh Controller)
MESH_URL="${MESH_URL:-http://127.0.0.1:3001}"
MESH_TOKEN="${MESH_TOKEN:-}"
MESH_PARTICIPANT_ID="${MESH_PARTICIPANT_ID:-YOUR_MESH_PARTICIPANT_ID}"
if [ -n "$MESH_PARTICIPANT_ID" ]; then
  curl -sf -X POST "$MESH_URL/trust/$MESH_PARTICIPANT_ID/event" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MESH_TOKEN" \
    -d "{\"actionType\":\"message_send\",\"outcome\":\"success\",\"severity\":\"medium\",\"context\":{\"toolName\":\"messenger-send.sh\",\"target\":\"$NAME\",\"channel\":\"messenger\",\"mode\":\"$MODE\"}}" \
    > /dev/null 2>&1 && echo "📊 trust_event recorded" || echo "⚠️ trust_event recording failed (non-blocking)"
fi

# 7. Post-send task list
msg_show_post_send_checklist
