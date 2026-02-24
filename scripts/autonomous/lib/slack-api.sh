#!/bin/bash
# slack-api.sh — Direct Slack Web API wrapper (bypasses MCP)
# Avoids DM cache corruption and channel limit issues

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

load_env

SLACK_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_API="https://slack.com/api"
SLACK_USER_ID="${SLACK_USER_ID:-YOUR_SLACK_USER_ID}"  # Your Slack user ID

if [ -z "$SLACK_TOKEN" ]; then
  log_error "SLACK_BOT_TOKEN not set in .env"
  exit 1
fi

# --- API call helper ---
slack_api() {
  local method="$1"
  local endpoint="$2"
  shift 2
  local params=("$@")

  local url="$SLACK_API/$endpoint"

  if [ "$method" = "GET" ]; then
    local query=""
    for param in "${params[@]}"; do
      if [ -z "$query" ]; then
        query="?$param"
      else
        query="$query&$param"
      fi
    done
    curl -s -H "Authorization: Bearer $SLACK_TOKEN" "${url}${query}"
  else
    local data="{}"
    if [ ${#params[@]} -gt 0 ]; then
      data="${params[0]}"
    fi
    curl -s -X POST \
      -H "Authorization: Bearer $SLACK_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url"
  fi
}

# --- Search mentions in the last N hours ---
slack_search_mentions() {
  local hours="${1:-4}"
  local count="${2:-20}"
  slack_api GET "search.messages" \
    "query=<@${SLACK_USER_ID}>" \
    "sort=timestamp" \
    "sort_dir=desc" \
    "count=$count"
}

# --- Get DM conversations history ---
slack_get_dm_history() {
  local channel_id="$1"
  local hours="${2:-4}"
  local limit="${3:-20}"
  local oldest
  oldest=$(hours_ago "$hours")
  slack_api GET "conversations.history" \
    "channel=$channel_id" \
    "oldest=$oldest" \
    "limit=$limit"
}

# --- List DM channels ---
slack_list_dms() {
  local limit="${1:-50}"
  slack_api GET "conversations.list" \
    "types=im,mpim" \
    "limit=$limit"
}

# --- Get unread DM messages ---
slack_get_unread_dms() {
  local hours="${1:-4}"
  local dms
  dms=$(slack_list_dms)

  local channels
  channels=$(echo "$dms" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('ok'):
    for ch in data.get('channels', []):
        if ch.get('is_im') and not ch.get('is_user_deleted'):
            print(ch['id'])
" 2>/dev/null)

  local all_messages="[]"
  while IFS= read -r ch_id; do
    [ -z "$ch_id" ] && continue
    local history
    history=$(slack_get_dm_history "$ch_id" "$hours")
    local msgs
    msgs=$(echo "$history" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('ok'):
    msgs = [m for m in data.get('messages', []) if m.get('user') != '$SLACK_USER_ID']
    for m in msgs:
        m['channel'] = '$ch_id'
    print(json.dumps(msgs))
else:
    print('[]')
" 2>/dev/null)
    all_messages=$(python3 -c "
import json
a = json.loads('$all_messages' if '$all_messages' != '[]' else '[]')
b = json.loads('''$msgs''')
print(json.dumps(a + b))
" 2>/dev/null)
  done <<< "$channels"

  echo "$all_messages"
}

# --- Send message ---
slack_send_message() {
  local channel_id="$1"
  local text="$2"
  local thread_ts="${3:-}"

  local payload
  payload=$(python3 -c "
import json
d = {'channel': '$channel_id', 'text': '''$text'''}
ts = '$thread_ts'
if ts:
    d['thread_ts'] = ts
print(json.dumps(d))
" 2>/dev/null)

  slack_api POST "chat.postMessage" "$payload"
}

# --- Send message to self (DM) ---
slack_send_self() {
  local text="$1"

  # Open DM with self
  local dm_response
  dm_response=$(slack_api POST "conversations.open" \
    "{\"users\":\"$SLACK_USER_ID\"}")

  local channel_id
  channel_id=$(echo "$dm_response" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('channel', {}).get('id', ''))
" 2>/dev/null)

  if [ -z "$channel_id" ]; then
    log_error "Failed to open self DM"
    return 1
  fi

  slack_send_message "$channel_id" "$text"
}

# --- Get channel info by name ---
slack_find_channel() {
  local name="$1"
  slack_api GET "conversations.list" \
    "types=public_channel,private_channel" \
    "limit=200" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('ok'):
    for ch in data.get('channels', []):
        if ch.get('name') == '$name':
            print(json.dumps({'id': ch['id'], 'name': ch['name']}))
            sys.exit(0)
print('{}')
" 2>/dev/null
}

# --- CLI interface ---
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cmd="${1:-help}"
  shift || true

  case "$cmd" in
    mentions)
      slack_search_mentions "${1:-4}" "${2:-20}"
      ;;
    dms)
      slack_get_unread_dms "${1:-4}"
      ;;
    send-self)
      slack_send_self "$1"
      ;;
    send)
      slack_send_message "$1" "$2" "${3:-}"
      ;;
    list-dms)
      slack_list_dms "${1:-50}"
      ;;
    find-channel)
      slack_find_channel "$1"
      ;;
    help|*)
      echo "Usage: slack-api.sh <command> [args]"
      echo ""
      echo "Commands:"
      echo "  mentions [hours] [count]     Search @mentions"
      echo "  dms [hours]                  Get unread DMs"
      echo "  send-self <text>             Send DM to self"
      echo "  send <channel> <text> [ts]   Send message"
      echo "  list-dms [limit]             List DM channels"
      echo "  find-channel <name>          Find channel by name"
      ;;
  esac
fi
