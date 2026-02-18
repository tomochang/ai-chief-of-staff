#!/bin/bash
# PostToolUse hook: remind Claude to complete the post-send checklist after sending an email
#
# Install: Add to .claude/settings.local.json under hooks.PostToolUse
# See README.md for configuration instructions.

# Read JSON from stdin (Claude Code passes tool execution context)
INPUT=$(cat)

# Only trigger for Bash tool
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# Get the command that was executed
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only trigger for email send commands
# Adjust the pattern below to match your email CLI tool
if [[ "$COMMAND" != *"gog gmail send"* ]]; then
  exit 0
fi

# Check if the email body contains scheduling keywords
# Add your own keywords here (these are English defaults + common patterns)
if echo "$COMMAND" | grep -qiE 'schedule|meeting|availability|free time|calendar|slot|let.s meet|can we meet|候補|日程|MTG'; then
  # Scheduling-specific block message
  cat << 'EOF'
{
  "decision": "block",
  "reason": "[Scheduling email sent — complete post-send processing NOW]\n\nExecute immediately without confirmation:\n\n1. **Register tentative calendar events** — Create [tentative] events for ALL proposed dates\n2. **Update relationships.md** — Add interaction history\n3. **Update todo.md** — Add to schedule table + pending response\n4. **Commit & push** — `cd YOUR_WORKSPACE && git add -A && git commit -m \"schedule follow-up\" && git push`\n\nDo not mark task complete until all 4 steps are done."
}
EOF
else
  # General post-send checklist
  cat << 'EOF'
{
  "decision": "block",
  "reason": "[Post-send checklist — mandatory]\n\nExecute the following NOW:\n\n1. If reply → verify --reply-to-message-id was used\n2. New contact → add to relationships.md\n3. Schedule/appointment related → add to todo.md pending items\n4. Tentative dates proposed → register [tentative] calendar events\n5. Commit & push → if private/ files were edited\n\nDo not mark complete until ALL steps are done."
}
EOF
fi

exit 0
