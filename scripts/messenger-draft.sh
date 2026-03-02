#!/bin/bash
# messenger-draft.sh — Messenger draft context collection
# Usage: messenger-draft.sh <recipient name> [--matrix|--chrome]
#
# Default: Fetch chat history via Chrome CDP (Playwright)
# --matrix: Matrix bridge fallback (deprecated for Messenger)
# --chrome: Chrome AppleScript fallback (legacy)
#
# Output: relationships info + chat history + YOUR_NAME's style samples
# ⚠️ Writing a draft without reading this output is prohibited

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: messenger-draft.sh <name> [--matrix|--chrome]}"
MODE="cdp"
if [[ "${2:-}" == "--matrix" ]]; then
  MODE="matrix"
elif [[ "${2:-}" == "--chrome" ]]; then
  MODE="chrome"
fi

TRIAGE_DIR="${TRIAGE_DIR:-$WORKSPACE/private}"

echo "=========================================="
echo "📋 Messenger draft context: $NAME ($MODE mode)"
echo "=========================================="

# 1. Extract person info from relationships.md
echo ""
echo "## 1. Relationships info"
echo "---"
msg_search_relationships "$NAME"

# 2. Chat history fetch
echo ""
echo "## 2. Chat history (last 20 messages)"
echo "---"

if [ "$MODE" = "cdp" ]; then
  # ==================== Chrome CDP (Playwright) — Default ====================
  echo "Chrome CDP-based chat history fetch via Playwright"
  echo ""
  echo "💡 Use messenger-check-cdp.js to fetch unread messages and chat context."
  echo "   node scripts/messenger-check-cdp.js"
  echo ""
  echo "If CDP is unavailable, try: messenger-draft.sh \"$NAME\" --matrix"

elif [ "$MODE" = "matrix" ]; then
  # ==================== Matrix Bridge (deprecated for Messenger) ====================
  ROOM_ID=$(msg_search_matrix_room "$NAME" "linebot")

  if [ -z "$ROOM_ID" ]; then
    echo "⚠️ Room '$NAME' not found (via Matrix)"
    echo "💡 Try default CDP mode instead (no flag needed)"
  else
    echo "Room: $ROOM_ID"
    echo ""
    msg_display_matrix_history "$ROOM_ID"
  fi

elif [ "$MODE" = "chrome" ]; then
  # ==================== Chrome AppleScript ====================
  echo "Chrome AppleScript-based chat history fetch"
  echo ""
  echo "📋 Run the following AppleScript in Mac Terminal:"
  echo ""
  echo "--- Step 1: Navigate to chat ---"
  echo 'osascript -e '"'"'tell application "Google Chrome" to execute tab TAB_NUM of window 1 javascript "window.location.href = '"'"'"'"'"'https://www.messenger.com/e2ee/t/THREAD_ID/'"'"'"'"'"'"'"'"''
  echo ""
  echo "--- Step 2: Wait 5 seconds, then fetch chat content ---"
  cat << 'APPLESCRIPT'
osascript << 'EOF'
tell application "Google Chrome"
  delay 5
  set result to execute tab TAB_NUM of window 1 javascript "
    (function() {
      var m = document.querySelector('[role=\"main\"]');
      if (!m) return 'no main';
      var t = m.innerText || '';
      return t.substring(Math.max(0, t.length - 3000));
    })()
  "
  return result
end tell
EOF
APPLESCRIPT
  echo ""
  echo "⚠️ Replace TAB_NUM and THREAD_ID with actual values"
  echo "  THREAD_ID can be found in the URL column of the messenger_triage file"
fi

# 4. Show matching triage entries
echo ""
echo "## 4. Triage info"
echo "---"
for f in "$TRIAGE_DIR/messenger_triage_"*.md "$TRIAGE_DIR/drafts/messenger-replies-"*.md; do
  if [ -f "$f" ]; then
    MATCH=$(grep -i "$NAME" "$f" 2>/dev/null || true)
    if [ -n "$MATCH" ]; then
      echo "File: $(basename "$f")"
      echo "$MATCH"
      echo "---"
    fi
  fi
done

echo ""
echo "=========================================="
echo "Please compose the draft based on the above context"
echo ""
echo "📝 Checklist (review before drafting):"
echo "  [ ] Does relationships.md have info? (add first if not)"
echo "  [ ] Did you read the chat history?"
echo "  [ ] Did you check YOUR_NAME's writing style?"
echo "  [ ] Did you confirm how to address the recipient?"
echo "  [ ] No unnecessary apologies included?"
echo "=========================================="
