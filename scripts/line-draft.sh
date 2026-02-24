#!/bin/bash
# line-draft.sh — LINE draft context collection
# Usage: line-draft.sh <recipient name>
# Output: relationships info + chat history + YOUR_NAME's style samples

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: line-draft.sh <name>}"

echo "=========================================="
echo "📋 LINE draft context: $NAME"
echo "=========================================="

# 1. Extract person info from relationships.md
echo ""
echo "## 1. Relationships info"
echo "---"
msg_search_relationships "$NAME"

# 2. Search Matrix room and get chat history
echo ""
echo "## 2. Chat history (last 20 messages)"
echo "---"
ROOM_ID=$(msg_search_matrix_room "$NAME")

if [ -z "$ROOM_ID" ]; then
  echo "⚠️ Room '$NAME' not found"
  exit 1
fi

echo "Room: $ROOM_ID"
echo ""

msg_display_matrix_history "$ROOM_ID"

echo ""
msg_extract_constraints "$NAME"

echo ""
echo "=========================================="
echo "Please compose the draft based on the above context"
echo "=========================================="
