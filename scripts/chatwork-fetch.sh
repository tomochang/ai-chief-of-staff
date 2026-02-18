#!/bin/bash
# chatwork-fetch.sh
# Fetch Chatwork messages and identify items needing attention.
#
# Usage:
#   bash scripts/chatwork-fetch.sh              # Default: messages from last 24h
#   bash scripts/chatwork-fetch.sh --hours 4    # Messages from last 4h
#   bash scripts/chatwork-fetch.sh --json       # JSON output for scripting
#
# Prerequisites:
#   - CHATWORK_API_TOKEN environment variable set
#
# Output:
#   JSON object with:
#     - my_account_id: your Chatwork account ID
#     - rooms: array of rooms with unread/recent activity
#     - action_required: messages needing your reply

set -euo pipefail

API_BASE="https://api.chatwork.com/v2"
HOURS=24
JSON_OUTPUT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --hours) HOURS="$2"; shift 2 ;;
    --json) JSON_OUTPUT=true; shift ;;
    *) shift ;;
  esac
done

if [[ -z "${CHATWORK_API_TOKEN:-}" ]]; then
  echo '{"error": "CHATWORK_API_TOKEN environment variable is not set"}' >&2
  exit 1
fi

cw_api() {
  curl -s -H "x-chatworktoken: ${CHATWORK_API_TOKEN}" "${API_BASE}$1"
}

# Step 1: Get my account info
MY_INFO=$(cw_api "/me")
MY_ACCOUNT_ID=$(echo "$MY_INFO" | jq -r '.account_id')
MY_NAME=$(echo "$MY_INFO" | jq -r '.name')

if [[ "$MY_ACCOUNT_ID" == "null" || -z "$MY_ACCOUNT_ID" ]]; then
  echo '{"error": "Failed to get account info. Check your API token."}' >&2
  exit 1
fi

>&2 echo "Logged in as: ${MY_NAME} (ID: ${MY_ACCOUNT_ID})"

# Step 2: Get rooms
ROOMS=$(cw_api "/rooms")
ROOM_COUNT=$(echo "$ROOMS" | jq 'length')
>&2 echo "Found ${ROOM_COUNT} rooms. Scanning for recent messages..."

# Calculate cutoff timestamp
CUTOFF=$(date -v-${HOURS}H +%s 2>/dev/null || date -d "${HOURS} hours ago" +%s)

# Step 3: Scan each room for recent messages
RESULTS="[]"
SCANNED=0

for ROOM_ID in $(echo "$ROOMS" | jq -r '.[].room_id'); do
  ROOM_NAME=$(echo "$ROOMS" | jq -r ".[] | select(.room_id == ${ROOM_ID}) | .name")
  ROOM_TYPE=$(echo "$ROOMS" | jq -r ".[] | select(.room_id == ${ROOM_ID}) | .type")
  UNREAD=$(echo "$ROOMS" | jq -r ".[] | select(.room_id == ${ROOM_ID}) | .unread_num")
  MENTION=$(echo "$ROOMS" | jq -r ".[] | select(.room_id == ${ROOM_ID}) | .mention_num")
  LAST_UPDATE=$(echo "$ROOMS" | jq -r ".[] | select(.room_id == ${ROOM_ID}) | .last_update_time")

  # Skip rooms with no recent activity (based on last_update_time)
  if [[ "$LAST_UPDATE" -lt "$CUTOFF" ]]; then
    continue
  fi

  # Skip "my" type rooms (personal memo)
  if [[ "$ROOM_TYPE" == "my" ]]; then
    continue
  fi

  # Fetch messages (force=1 to get even if no unread)
  MESSAGES=$(cw_api "/rooms/${ROOM_ID}/messages?force=1" 2>/dev/null || echo "[]")

  # Handle API errors or empty responses
  if [[ -z "$MESSAGES" || "$MESSAGES" == "null" ]]; then
    continue
  fi

  # Filter messages within time window
  RECENT=$(echo "$MESSAGES" | jq --argjson cutoff "$CUTOFF" --argjson my_id "$MY_ACCOUNT_ID" '
    [.[] | select(.send_time >= $cutoff)] |
    if length == 0 then [] else
      map({
        message_id: .message_id,
        account_id: .account.account_id,
        account_name: .account.name,
        body: .body,
        send_time: .send_time,
        is_mine: (.account.account_id == $my_id),
        to_me: (.body | test("\\[To:" + ($my_id | tostring) + "\\]"))
      })
    end
  ' 2>/dev/null || echo "[]")

  RECENT_COUNT=$(echo "$RECENT" | jq 'length')
  if [[ "$RECENT_COUNT" == "0" ]]; then
    continue
  fi

  # Determine if action is required:
  # - Last message is NOT from me AND (mentions me OR is a DM)
  LAST_MSG=$(echo "$RECENT" | jq 'last')
  LAST_IS_MINE=$(echo "$LAST_MSG" | jq '.is_mine')
  LAST_TO_ME=$(echo "$LAST_MSG" | jq '.to_me')

  # Check if any recent message is addressed to me and unanswered
  HAS_TO_ME=$(echo "$RECENT" | jq '[.[] | select(.to_me == true and .is_mine == false)] | length')

  NEEDS_ACTION=false
  if [[ "$LAST_IS_MINE" == "false" ]]; then
    if [[ "$HAS_TO_ME" -gt 0 || "$ROOM_TYPE" == "direct" ]]; then
      NEEDS_ACTION=true
    fi
  fi

  ROOM_RESULT=$(jq -n \
    --argjson room_id "$ROOM_ID" \
    --arg room_name "$ROOM_NAME" \
    --arg room_type "$ROOM_TYPE" \
    --argjson unread "$UNREAD" \
    --argjson mention "$MENTION" \
    --argjson messages "$RECENT" \
    --argjson needs_action "$NEEDS_ACTION" \
    '{
      room_id: $room_id,
      room_name: $room_name,
      room_type: $room_type,
      unread_num: $unread,
      mention_num: $mention,
      needs_action: $needs_action,
      messages: $messages
    }')

  RESULTS=$(echo "$RESULTS" | jq --argjson room "$ROOM_RESULT" '. + [$room]')
  SCANNED=$((SCANNED + 1))

  # Rate limit: avoid hitting 300 req / 5 min
  if (( SCANNED % 30 == 0 )); then
    >&2 echo "Scanned ${SCANNED} rooms, pausing briefly..."
    sleep 2
  fi
done

>&2 echo "Scan complete. ${SCANNED} rooms with activity."

# Build final output
ACTION_COUNT=$(echo "$RESULTS" | jq '[.[] | select(.needs_action == true)] | length')

echo "$RESULTS" | jq \
  --argjson my_id "$MY_ACCOUNT_ID" \
  --arg my_name "$MY_NAME" \
  --argjson hours "$HOURS" \
  --argjson ac "$ACTION_COUNT" \
  '{
    my_account_id: $my_id,
    my_name: $my_name,
    scan_hours: $hours,
    rooms_with_activity: length,
    action_required: $ac,
    rooms: .
  }'
