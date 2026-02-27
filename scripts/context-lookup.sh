#!/bin/bash
# context-lookup.sh — Search local files + calendar for a person/keyword
# before falling back to Slack/email search during triage.
#
# Usage:
#   scripts/context-lookup.sh "Tanaka"
#   scripts/context-lookup.sh "dinner"
#
# Prerequisites:
#   - A calendar CLI tool (this uses `gog calendar events`)
#   - Adjust CALENDAR_CMD and file paths below to match your setup
#
# What it searches:
#   1. relationships.md — contact history and notes
#   2. todo.md — pending tasks and scheduled events
#   3. Calendar — events in the next 30 days

KEYWORD="$1"
if [ -z "$KEYWORD" ]; then
  echo "Usage: context-lookup.sh <keyword>"
  echo "Example: context-lookup.sh \"Tanaka\""
  exit 1
fi

# ============================================================
# CONFIGURATION — Edit these to match your setup
# ============================================================
WORKSPACE="${WORKSPACE:-$HOME/clawd}"
RELATIONSHIPS_FILE="${WORKSPACE}/private/relationships.md"
TODO_FILE="${WORKSPACE}/private/todo.md"
CALENDAR_ACCOUNT="${CALENDAR_ACCOUNT:-}"  # e.g. your-email@example.com
CALENDAR_DAYS=30

# ============================================================
# 1. Relationships file
# ============================================================
echo "=== relationships.md ==="
if [ -f "$RELATIONSHIPS_FILE" ]; then
  grep -n -i "$KEYWORD" "$RELATIONSHIPS_FILE" || echo "(no matches)"
else
  echo "(file not found: $RELATIONSHIPS_FILE)"
fi

# ============================================================
# 2. Todo file
# ============================================================
echo ""
echo "=== todo.md ==="
if [ -f "$TODO_FILE" ]; then
  grep -n -i "$KEYWORD" "$TODO_FILE" || echo "(no matches)"
else
  echo "(file not found: $TODO_FILE)"
fi

# ============================================================
# 3. Calendar (next N days)
# ============================================================
echo ""
echo "=== calendar (next ${CALENDAR_DAYS} days) ==="

# Date formatting (macOS vs GNU)
if date -v+0d '+%Y-%m-%d' >/dev/null 2>&1; then
  # macOS
  FROM=$(date -v+0d '+%Y-%m-%dT00:00:00+09:00')
  TO=$(date -v+${CALENDAR_DAYS}d '+%Y-%m-%dT00:00:00+09:00')
else
  # GNU/Linux
  FROM=$(date -d "today" '+%Y-%m-%dT00:00:00+09:00')
  TO=$(date -d "+${CALENDAR_DAYS} days" '+%Y-%m-%dT00:00:00+09:00')
fi

CALENDAR_CMD="gog calendar events --from \"$FROM\" --to \"$TO\" --max 100 --plain"
if [ -n "$CALENDAR_ACCOUNT" ]; then
  CALENDAR_CMD="$CALENDAR_CMD -a $CALENDAR_ACCOUNT"
fi

eval "$CALENDAR_CMD" 2>/dev/null | grep -i "$KEYWORD" || echo "(no matches)"
