#!/bin/bash
# messenger-send.sh — Messenger send + verification + auto status update
# Usage: messenger-send.sh <recipient name> <message> [--cdp|--matrix|--chrome]
#
# Modes:
#   (default)  CDP + Playwright (recommended for E2EE chats)
#   --cdp      Same as default (explicit)
#   --matrix   Matrix bridge (deprecated for Messenger — use for LINE instead)
#   --chrome   Chrome AppleScript fallback (legacy, does NOT work with E2EE)
#
# CDP mode options:
#   --thread <id>  E2EE thread ID (skips search, more reliable)
#   --dry-run      Type message but don't send
#
# Flow:
# 1. Approval check (status file verification)
# 2. Send (Matrix API / CDP+Playwright / Chrome AppleScript)
# 3. Response verification
# 4. Auto status file update
# 5. Post-send task list

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: messenger-send.sh <name> <message> [--cdp|--matrix|--chrome]}"
MESSAGE="${2:?Usage: messenger-send.sh <name> <message> [--cdp|--matrix|--chrome]}"
MODE="cdp"
THREAD_ID=""
E2EE=""
DRY_RUN=""
shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdp) MODE="cdp" ;;
    --matrix) MODE="matrix" ;;
    --chrome) MODE="chrome" ;;
    --thread) THREAD_ID="${2:?--thread requires a value}"; shift ;;
    --e2ee) E2EE="--e2ee" ;;
    --dry-run) DRY_RUN="--dry-run" ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

DRAFT_FILE="$MSG_DRAFT_DIR/messenger-replies-$MSG_TODAY.md"
TRIAGE_FILE="${TRIAGE_DIR:-$WORKSPACE/private}/messenger_triage_$MSG_TODAY.md"

# 0. Approval check
msg_require_approval "$NAME" "$DRAFT_FILE" "$TRIAGE_FILE"

echo "📤 Messenger send: $NAME ($MODE mode)"
echo "=========================================="

if [ "$MODE" = "matrix" ]; then
  # ==================== Matrix Bridge (deprecated for Messenger) ====================

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

elif [ "$MODE" = "cdp" ]; then
  # ==================== CDP + Playwright ====================
  # Recommended for E2EE chats. Requires headless Chrome on port 9222.

  echo "📤 Sending via CDP + Playwright..."

  CDP_ARGS=(--to "$NAME" --message "$MESSAGE")
  if [ -n "$THREAD_ID" ]; then
    CDP_ARGS=(--thread "$THREAD_ID" --message "$MESSAGE")
    if [ -n "$E2EE" ]; then
      CDP_ARGS+=("--e2ee")
    fi
  fi
  if [ -n "$DRY_RUN" ]; then
    CDP_ARGS+=("--dry-run")
  fi

  RESULT=$(node "$SCRIPT_DIR/messenger-send-cdp.js" "${CDP_ARGS[@]}" 2>&1)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ CDP send failed:"
    echo "$RESULT"
    exit 1
  fi

  # Parse JSON result from stdout (last line)
  SUCCESS=$(echo "$RESULT" | tail -1 | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('success',''))" 2>/dev/null || echo "")

  if [ "$SUCCESS" != "True" ]; then
    echo "❌ Send verification failed"
    echo "$RESULT"
    exit 1
  fi

  if [ -n "$DRY_RUN" ]; then
    echo "🔍 DRY RUN — message typed but not sent"
    echo "$RESULT"
    exit 0
  fi

  echo "✅ Send success (CDP)"

elif [ "$MODE" = "chrome" ]; then
  # ==================== Chrome AppleScript (Legacy) ====================
  # ⚠️ WARNING: execCommand does NOT work with E2EE chats.
  # Use --cdp mode instead for E2EE conversations.
  # Prerequisite: Chrome with Messenger tab open on Mac + chat visible

  echo "⚠️ WARNING: Chrome AppleScript mode does NOT work with E2EE chats."
  echo "   Use --cdp mode instead: messenger-send.sh \"$NAME\" \"$MESSAGE\" --cdp"
  echo ""
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
