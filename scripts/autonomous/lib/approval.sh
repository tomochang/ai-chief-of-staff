#!/bin/bash
# approval.sh — HITL approval flow via Slack reactions/replies
# Sends action items with structured format, polls for approval signals
#
# Approval mechanism (no webhook needed):
#   - Send action item to Slack DM with emoji instructions
#   - User reacts with ✅ (approve), ❌ (reject), or replies with edits
#   - Poll for reactions on pending messages
#   - Timeout after configurable hours

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"
load_env

SLACK_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_API="https://slack.com/api"
PENDING_DIR="$CLAWD_DIR/logs/pending-approvals"
mkdir -p "$PENDING_DIR"

APPROVAL_TIMEOUT_H=$(config_get "hitl.approval_timeout_hours" "4")
REMINDER_TIMEOUT_H=$(config_get "hitl.reminder_timeout_hours" "8")

# --- Send approval request ---
# Returns: message timestamp (ts) for tracking
send_approval_request() {
  local channel_id="$1"
  local item_type="$2"    # email | slack
  local summary="$3"
  local draft_reply="$4"
  local item_id="$5"      # threadId or channel+ts

  local message
  message=$(cat <<MSGEOF
:red_circle: *要対応 [$item_type]*

$summary

---
:pencil: *返信案:*
\`\`\`
$draft_reply
\`\`\`

:point_right: リアクションで指示:
  :white_check_mark: = 承認（この返信案で送信）
  :x: = 却下（対応しない）
  :memo: = スレッドに修正版を書いてください
MSGEOF
)

  local response
  response=$(curl -s -X POST \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
print(json.dumps({
    'channel': '$channel_id',
    'text': '''$message'''
}))
")" \
    "$SLACK_API/chat.postMessage")

  local msg_ts
  msg_ts=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ts',''))" 2>/dev/null)

  if [ -n "$msg_ts" ]; then
    # Save pending approval record
    local record_file="$PENDING_DIR/${msg_ts}.json"
    python3 -c "
import json
record = {
    'ts': '$msg_ts',
    'channel': '$channel_id',
    'item_type': '$item_type',
    'item_id': '$item_id',
    'status': 'pending',
    'created_at': '$(now_iso)',
    'draft_reply': '''$draft_reply''',
    'summary': '''$summary'''
}
with open('$record_file', 'w') as f:
    json.dump(record, f, ensure_ascii=False, indent=2)
"
    log_info "Approval request sent: ts=$msg_ts"
    echo "$msg_ts"
  else
    log_error "Failed to send approval request"
    echo ""
  fi
}

# --- Check pending approvals ---
check_pending_approvals() {
  local now
  now=$(now_epoch)

  for record_file in "$PENDING_DIR"/*.json; do
    [ -f "$record_file" ] || continue

    local record
    record=$(cat "$record_file")

    local status
    status=$(echo "$record" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    [ "$status" != "pending" ] && continue

    local msg_ts channel created_at
    msg_ts=$(echo "$record" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ts',''))" 2>/dev/null)
    channel=$(echo "$record" | python3 -c "import json,sys; print(json.load(sys.stdin).get('channel',''))" 2>/dev/null)
    created_at=$(echo "$record" | python3 -c "import json,sys; print(json.load(sys.stdin).get('created_at',''))" 2>/dev/null)

    # Check for reactions
    local reactions_response
    reactions_response=$(curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
      "$SLACK_API/reactions.get?channel=$channel&timestamp=$msg_ts")

    local decision
    decision=$(echo "$reactions_response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('ok'):
    print('none')
    sys.exit(0)
msg = data.get('message', {})
reactions = msg.get('reactions', [])
for r in reactions:
    # Check if user reacted (not the bot)
    users = r.get('users', [])
    non_bot_users = [u for u in users if u == '${SLACK_USER_ID}']
    if non_bot_users:
        name = r.get('name', '')
        if name in ('white_check_mark', 'heavy_check_mark', '+1', 'thumbsup'):
            print('approved')
            sys.exit(0)
        elif name in ('x', 'no_entry', '-1', 'thumbsdown'):
            print('rejected')
            sys.exit(0)
        elif name in ('memo', 'pencil', 'writing_hand'):
            print('edit_requested')
            sys.exit(0)
print('none')
" 2>/dev/null)

    case "$decision" in
      approved)
        log_info "Approval received for $msg_ts"
        # Update record
        python3 -c "
import json
with open('$record_file') as f:
    r = json.load(f)
r['status'] = 'approved'
r['decided_at'] = '$(now_iso)'
with open('$record_file', 'w') as f:
    json.dump(r, f, ensure_ascii=False, indent=2)
"
        echo "APPROVED:$msg_ts"
        ;;
      rejected)
        log_info "Rejection received for $msg_ts"
        python3 -c "
import json
with open('$record_file') as f:
    r = json.load(f)
r['status'] = 'rejected'
r['decided_at'] = '$(now_iso)'
with open('$record_file', 'w') as f:
    json.dump(r, f, ensure_ascii=False, indent=2)
"
        echo "REJECTED:$msg_ts"
        ;;
      edit_requested)
        log_info "Edit requested for $msg_ts — checking thread replies"
        # Get thread replies for edited content
        local replies
        replies=$(curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
          "$SLACK_API/conversations.replies?channel=$channel&ts=$msg_ts&limit=5")

        local edited_text
        edited_text=$(echo "$replies" | python3 -c "
import json, sys
data = json.load(sys.stdin)
msgs = data.get('messages', [])
# Find reply from user (not bot)
for m in msgs[1:]:  # skip original message
    if m.get('user') == '${SLACK_USER_ID}':
        print(m.get('text', ''))
        sys.exit(0)
print('')
" 2>/dev/null)

        if [ -n "$edited_text" ]; then
          python3 -c "
import json
with open('$record_file') as f:
    r = json.load(f)
r['status'] = 'edited'
r['decided_at'] = '$(now_iso)'
r['edited_reply'] = '''$edited_text'''
with open('$record_file', 'w') as f:
    json.dump(r, f, ensure_ascii=False, indent=2)
"
          echo "EDITED:$msg_ts"
        else
          echo "EDIT_PENDING:$msg_ts"
        fi
        ;;
      none)
        # Check timeout
        local created_epoch
        created_epoch=$(date -jf "%Y-%m-%dT%H:%M:%S%z" "$created_at" +%s 2>/dev/null || echo "0")
        local age_hours=$(( (now - created_epoch) / 3600 ))

        if [ "$age_hours" -ge "$REMINDER_TIMEOUT_H" ]; then
          log_warn "Approval timed out (${age_hours}h) for $msg_ts"
          python3 -c "
import json
with open('$record_file') as f:
    r = json.load(f)
r['status'] = 'timed_out'
r['decided_at'] = '$(now_iso)'
with open('$record_file', 'w') as f:
    json.dump(r, f, ensure_ascii=False, indent=2)
"
          echo "TIMED_OUT:$msg_ts"
        elif [ "$age_hours" -ge "$APPROVAL_TIMEOUT_H" ]; then
          # Send reminder
          log_info "Sending reminder for $msg_ts (${age_hours}h elapsed)"
          curl -s -X POST \
            -H "Authorization: Bearer $SLACK_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"channel\":\"$channel\",\"text\":\":alarm_clock: リマインダー: 上の要対応アイテムが未処理です (${age_hours}時間経過)\",\"thread_ts\":\"$msg_ts\"}" \
            "$SLACK_API/chat.postMessage" > /dev/null
          echo "REMINDED:$msg_ts"
        else
          echo "WAITING:$msg_ts"
        fi
        ;;
    esac
  done
}

# --- Clean old records ---
cleanup_old_records() {
  local max_age_days="${1:-7}"
  find "$PENDING_DIR" -name "*.json" -mtime "+$max_age_days" -delete 2>/dev/null
  log_info "Cleaned up approval records older than ${max_age_days} days"
}

# --- CLI ---
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cmd="${1:-help}"
  shift || true

  case "$cmd" in
    check)
      check_pending_approvals
      ;;
    cleanup)
      cleanup_old_records "${1:-7}"
      ;;
    send)
      # send <channel> <type> <summary> <draft> <item_id>
      send_approval_request "$1" "$2" "$3" "$4" "$5"
      ;;
    help|*)
      echo "Usage: approval.sh <command> [args]"
      echo ""
      echo "Commands:"
      echo "  check                Check all pending approvals for reactions"
      echo "  cleanup [days]       Remove old records (default: 7 days)"
      echo "  send <ch> <type> <summary> <draft> <id>  Send approval request"
      ;;
  esac
fi
