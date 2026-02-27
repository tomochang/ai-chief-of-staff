#!/bin/bash
# PostToolUse hook: unified post-action checks for Slack, calendar, and email
#
# Replaces post-send.sh with broader coverage:
#   - Slack messages with scheduling keywords → enforce calendar/todo update
#   - Calendar delete → enforce check for related tentative events
#   - Calendar create/update → enforce showing changes to user with evidence
#   - Email send → enforce post-send checklist (migrated from post-send.sh)
#
# Install: Add to .claude/settings.local.json under hooks.PostToolUse:
#   {
#     "matcher": "Bash|mcp__slack__conversations_add_message",
#     "hooks": [{ "type": "command", "command": "/path/to/post-action-check.sh" }]
#   }
#
# For tools not matching the above, exit 0 immediately (zero overhead).

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

case "$TOOL_NAME" in
  mcp__slack__conversations_add_message)
    # Slack message with scheduling keywords → enforce calendar/todo update
    PAYLOAD=$(echo "$INPUT" | jq -r '.tool_input.payload // ""')
    # Add your language's scheduling keywords to this pattern
    if echo "$PAYLOAD" | grep -qiE 'schedule|meeting|availability|free|slot|let.s meet|confirm|tentative|候補|日程|MTG|打ち合わせ|ご都合|スケジュール|ミーティング|面談|飲み|ご飯|仮|確定|予定|空いて'; then
      cat << 'EOF'
{
  "decision": "block",
  "reason": "[Slack scheduling message sent — complete post-send processing NOW]\n\nExecute immediately without confirmation:\n\n1. **Check/update calendar** — If dates were confirmed or tentatively agreed, create/update events\n2. **Update todo.md** — Add to schedule table + pending items\n3. **Update relationships.md** — Add interaction history for the contact\n4. **Commit & push** — `cd YOUR_WORKSPACE && git add -A && git commit -m \"post-slack follow-up\" && git push`\n\nDo not mark task complete until all 4 steps are done."
}
EOF
    else
      exit 0
    fi
    ;;

  Bash)
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

    if [[ "$COMMAND" == *"calendar delete"* ]] || [[ "$COMMAND" == *"cal delete"* ]]; then
      # Calendar delete → check for related tentative/confirmed events
      cat << 'EOF'
{
  "decision": "block",
  "reason": "[Calendar event deleted — verify related events]\n\nIf the deleted event had [tentative] in its title:\n1. **Check for a confirmed version** — search calendar for same-name event without [tentative]\n2. If no confirmed event exists, **ask user if a confirmed event should be created**\n3. **Sync todo.md** — remove or update the corresponding entry\n\nIf a non-tentative event was deleted:\n1. **Verify deletion was intentional** — confirm evidence supports this\n2. **Update todo.md** — remove the corresponding schedule entry"
}
EOF

    elif [[ "$COMMAND" == *"calendar create"* ]] || [[ "$COMMAND" == *"cal create"* ]] || \
         [[ "$COMMAND" == *"calendar update"* ]] || [[ "$COMMAND" == *"cal update"* ]]; then
      # Calendar create/update → show changes to user with evidence
      cat << 'EOF'
{
  "decision": "block",
  "reason": "[Calendar modified — display changes to user]\n\nShow the user what was just created/updated:\n\n1. **Summarize the change** — what event, when, with whom\n2. **Cite the evidence** — which email/Slack message/conversation justified this change\n3. **Ask for confirmation** — verify date, time, participants, and location are correct\n\nDo not proceed if the change was based on assumption rather than evidence."
}
EOF

    elif [[ "$COMMAND" == *"gmail send"* ]] || [[ "$COMMAND" == *"mail send"* ]]; then
      # Email send → post-send checklist (migrated from post-send.sh)
      if echo "$COMMAND" | grep -qiE 'schedule|meeting|availability|free time|calendar|slot|let.s meet|候補|日程|MTG|打ち合わせ|ご都合|スケジュール|ミーティング|面談'; then
        cat << 'EOF'
{
  "decision": "block",
  "reason": "[Scheduling email sent — complete post-send processing NOW]\n\nExecute immediately without confirmation:\n\n1. **Register tentative calendar events** — Create [tentative] events for ALL proposed dates\n2. **Update relationships.md** — Add interaction history\n3. **Update todo.md** — Add to schedule table + pending response\n4. **Commit & push** — `cd YOUR_WORKSPACE && git add -A && git commit -m \"schedule follow-up\" && git push`\n\nDo not mark task complete until all 4 steps are done."
}
EOF
      else
        cat << 'EOF'
{
  "decision": "block",
  "reason": "[Post-send checklist — mandatory]\n\nExecute the following NOW:\n\n1. If reply → verify --reply-to-message-id was used\n2. New contact → add to relationships.md\n3. Schedule/appointment related → add to todo.md pending items\n4. Tentative dates proposed → register [tentative] calendar events\n5. Commit & push → if private/ files were edited\n\nDo not mark complete until ALL steps are done."
}
EOF
      fi
    else
      exit 0
    fi
    ;;

  *)
    exit 0
    ;;
esac

exit 0
