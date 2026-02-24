#!/bin/bash
# slack-bridge.sh — Slack DM → claude -p → Slack reply bridge
# Messages sent to Slack DM are passed to Claude Code CLI, and results are replied in thread

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
load_env

SLACK_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_API="https://slack.com/api"
SLACK_USER_ID="${SLACK_USER_ID:-YOUR_SLACK_USER_ID}"
STATE_FILE="$CLAWD_DIR/logs/slack-bridge-state.json"
BRIDGE_LOG="$LOG_DIR/autonomous-slack-bridge.log"

# Bot user ID (to ignore own bot messages)
BOT_USER_ID=""

# --- Initialize ---
init_state() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "{\"last_ts\": \"$(date +%s).000000\", \"processed\": []}" > "$STATE_FILE"
  fi
}

get_last_ts() {
  python3 -c "
import json
with open('$STATE_FILE') as f:
    print(json.load(f).get('last_ts', '0'))
" 2>/dev/null || echo "0"
}

save_last_ts() {
  local ts="$1"
  python3 -c "
import json
with open('$STATE_FILE') as f:
    state = json.load(f)
state['last_ts'] = '$ts'
# Keep only last 100 processed
state['processed'] = state.get('processed', [])[-100:]
with open('$STATE_FILE', 'w') as f:
    json.dump(state, f)
" 2>/dev/null
}

is_processed() {
  local ts="$1"
  python3 -c "
import json
with open('$STATE_FILE') as f:
    state = json.load(f)
print('yes' if '$ts' in state.get('processed', []) else 'no')
" 2>/dev/null || echo "no"
}

mark_processed() {
  local ts="$1"
  python3 -c "
import json
with open('$STATE_FILE') as f:
    state = json.load(f)
processed = state.get('processed', [])
if '$ts' not in processed:
    processed.append('$ts')
state['processed'] = processed[-100:]
with open('$STATE_FILE', 'w') as f:
    json.dump(state, f)
" 2>/dev/null
}

# --- Get bot's own user_id ---
get_bot_user_id() {
  if [ -z "$BOT_USER_ID" ]; then
    BOT_USER_ID=$(curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
      "$SLACK_API/auth.test" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('user_id', ''))
" 2>/dev/null)
  fi
  echo "$BOT_USER_ID"
}

# --- Get self DM channel ID ---
get_self_dm_channel() {
  local response
  response=$(curl -s -X POST \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"users\":\"$SLACK_USER_ID\"}" \
    "$SLACK_API/conversations.open")

  echo "$response" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('channel', {}).get('id', ''))
" 2>/dev/null
}

# --- typing indicator ---
send_typing() {
  local channel="$1"
  # Slack doesn't have a typing API for bots, so we send a "thinking" message
  local response
  response=$(curl -s -X POST \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$channel\",\"text\":\":hourglass_flowing_sand: Processing...\"}" \
    "$SLACK_API/chat.postMessage")
  echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ts',''))" 2>/dev/null
}

# --- delete message ---
delete_message() {
  local channel="$1" ts="$2"
  curl -s -X POST \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$channel\",\"ts\":\"$ts\"}" \
    "$SLACK_API/chat.delete" > /dev/null 2>&1
}

# --- Slack reply (with long message splitting) ---
send_reply() {
  local channel="$1" text="$2" thread_ts="${3:-}"

  # Slack character limit (~4000 chars)
  local max_len=3500
  local text_len=${#text}

  if [ "$text_len" -le "$max_len" ]; then
    local payload
    payload=$(python3 -c "
import json
d = {'channel': '$channel', 'text': '''$(echo "$text" | sed "s/'/\\\\'/g")'''}
ts = '$thread_ts'
if ts:
    d['thread_ts'] = ts
print(json.dumps(d))
" 2>/dev/null)
    curl -s -X POST \
      -H "Authorization: Bearer $SLACK_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "$SLACK_API/chat.postMessage" > /dev/null 2>&1
  else
    # Split and send
    python3 -c "
import json, sys

text = '''$(echo "$text" | sed "s/'/\\\\'/g")'''
channel = '$channel'
thread_ts = '$thread_ts'
max_len = $max_len
chunks = []
while text:
    if len(text) <= max_len:
        chunks.append(text)
        break
    # Try to split at newline
    cut = text.rfind('\n', 0, max_len)
    if cut <= 0:
        cut = max_len
    chunks.append(text[:cut])
    text = text[cut:].lstrip('\n')

for chunk in chunks:
    d = {'channel': channel, 'text': chunk}
    if thread_ts:
        d['thread_ts'] = thread_ts
    print(json.dumps(d))
" 2>/dev/null | while IFS= read -r payload; do
      curl -s -X POST \
        -H "Authorization: Bearer $SLACK_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$SLACK_API/chat.postMessage" > /dev/null 2>&1
      sleep 0.5
    done
  fi
}

# --- Main: check and process new DMs ---
process_new_messages() {
  local dm_channel
  dm_channel=$(get_self_dm_channel)
  if [ -z "$dm_channel" ]; then
    log_error "Could not get DM channel"
    return 1
  fi

  local bot_id
  bot_id=$(get_bot_user_id)

  local last_ts
  last_ts=$(get_last_ts)

  # Fetch latest messages
  local history
  history=$(curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
    "$SLACK_API/conversations.history?channel=$dm_channel&oldest=$last_ts&limit=10")

  # Extract only user messages (exclude bot's own messages)
  local messages
  messages=$(echo "$history" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('ok'):
    print('[]')
    sys.exit(0)
msgs = []
for m in data.get('messages', []):
    # Exclude bot messages and subtype messages (join/leave etc)
    if m.get('bot_id') or m.get('subtype'):
        continue
    # Only messages from the user
    if m.get('user') == '$SLACK_USER_ID':
        msgs.append({
            'ts': m['ts'],
            'text': m.get('text', ''),
            'thread_ts': m.get('thread_ts', '')
        })
# Sort oldest first
msgs.sort(key=lambda x: float(x['ts']))
print(json.dumps(msgs))
" 2>/dev/null)

  local msg_count
  msg_count=$(echo "$messages" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

  if [ "$msg_count" = "0" ]; then
    log_debug "No new messages"
    return 0
  fi

  log_info "Found $msg_count new message(s) to process"

  # Process each message
  echo "$messages" | python3 -c "
import json, sys
for m in json.load(sys.stdin):
    print(f\"{m['ts']}\t{m['text']}\t{m.get('thread_ts', '')}\")
" 2>/dev/null | while IFS=$'\t' read -r msg_ts msg_text msg_thread_ts; do
    [ -z "$msg_ts" ] && continue
    [ -z "$msg_text" ] && continue

    # Check if already processed
    if [ "$(is_processed "$msg_ts")" = "yes" ]; then
      continue
    fi

    log_info "Processing message: ${msg_text:0:80}..."

    # Show processing indicator
    thinking_ts=$(send_typing "$dm_channel")

    # Execute with claude -p
    local result
    result=$(claude -p \
      --allowedTools "Bash(gog *),Bash(git *),Read,Grep,Glob" \
      --max-turns 15 \
      --output-format json \
      --append-system-prompt "You are YOUR_NAME's assistant. Execute instructions received via Slack DM and reply concisely. Working directory is $CLAWD_DIR." \
      "$msg_text" 2>>"$BRIDGE_LOG") || {
      result='{"result": "An error occurred. Please check the logs."}'
    }

    # Extract result
    local reply_text
    reply_text=$(echo "$result" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    result = data.get('result', '')
    if not result:
        result = data.get('content', str(data))
    # Truncate if too long
    if len(result) > 10000:
        result = result[:10000] + '\n\n...(truncated)'
    print(result)
except:
    print('Failed to parse result')
" 2>/dev/null || echo "Failed to parse result")

    # Delete processing message
    if [ -n "$thinking_ts" ]; then
      delete_message "$dm_channel" "$thinking_ts"
    fi

    # Reply in thread or DM
    local reply_thread="${msg_thread_ts:-$msg_ts}"
    send_reply "$dm_channel" "$reply_text" "$reply_thread"

    # Mark as processed
    mark_processed "$msg_ts"
    save_last_ts "$msg_ts"

    log_info "Reply sent for message $msg_ts"
  done
}

# ==========================================================
# Main
# ==========================================================
log_info "=== Slack bridge check ==="
init_state
process_new_messages
log_info "=== Slack bridge done ==="
