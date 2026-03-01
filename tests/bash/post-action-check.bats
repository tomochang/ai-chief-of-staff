#!/usr/bin/env bats
# Tests for post-action-check.sh — routing logic for Slack, calendar, and email hooks

HOOK_SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/hooks/post-action-check.sh"

# ---------------------------------------------------------------------------
# Slack scheduling detection
# ---------------------------------------------------------------------------

@test "Slack message with English scheduling keyword triggers block" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"mcp__slack__conversations_add_message","tool_input":{"channel_id":"C123","payload":"Let me schedule meeting for next Tuesday"}}'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "Slack scheduling"
}

@test "Slack message with Japanese scheduling keyword triggers block" {
  local input
  input=$(printf '{"tool_name":"mcp__slack__conversations_add_message","tool_input":{"channel_id":"C123","payload":"%s"}}' '来週の日程の候補をお送りします')
  run bash "$HOOK_SCRIPT" <<< "$input"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "Slack scheduling"
}

@test "Slack message with Japanese keyword uchiawase triggers block" {
  local input
  input=$(printf '{"tool_name":"mcp__slack__conversations_add_message","tool_input":{"channel_id":"C123","payload":"%s"}}' '打ち合わせの件です')
  run bash "$HOOK_SCRIPT" <<< "$input"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
}

@test "Slack non-scheduling message passes through" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"mcp__slack__conversations_add_message","tool_input":{"channel_id":"C123","payload":"Thanks for the update"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ---------------------------------------------------------------------------
# Calendar operations (via Bash tool)
# ---------------------------------------------------------------------------

@test "gog calendar delete triggers block with delete-related reason" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog calendar delete abc123 -a tomo@example.com --force"}}'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "deleted"
}

@test "gog cal create triggers block with calendar-modified reason" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog cal create primary -a tomo@example.com --summary \"Lunch\" --from 2026-03-01T12:00:00+09:00 --to 2026-03-01T13:00:00+09:00"}}'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "Calendar modified"
}

@test "gog calendar update triggers block" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog calendar update eventId --summary \"Updated meeting\""}}'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "Calendar modified"
}

# ---------------------------------------------------------------------------
# Email send (via Bash tool)
# ---------------------------------------------------------------------------

@test "gog gmail send with scheduling keyword triggers block with scheduling reason" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog gmail send -a tomo@example.com --to someone@example.com --subject \"Meeting schedule\" --body \"Here are the 候補 dates\""}}'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "Scheduling email"
}

@test "gog gmail send without scheduling keyword triggers block with checklist reason" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog gmail send -a tomo@example.com --to someone@example.com --subject \"Invoice\" --body \"Please find attached\""}}'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason' | grep -q "Post-send checklist"
}

# ---------------------------------------------------------------------------
# Pass-through cases
# ---------------------------------------------------------------------------

@test "Unrelated Bash command passes through" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "Unknown tool passes through" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Read","tool_input":{"file_path":"/tmp/foo.txt"}}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ---------------------------------------------------------------------------
# Exit code invariant: all paths exit 0
# ---------------------------------------------------------------------------

@test "Blocking Slack path exits 0" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"mcp__slack__conversations_add_message","tool_input":{"channel_id":"C1","payload":"schedule meeting"}}'
  [ "$status" -eq 0 ]
}

@test "Blocking calendar delete path exits 0" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog calendar delete xyz"}}'
  [ "$status" -eq 0 ]
}

@test "Blocking email send path exits 0" {
  run bash "$HOOK_SCRIPT" <<< '{"tool_name":"Bash","tool_input":{"command":"gog gmail send --to a@b.com --body hello"}}'
  [ "$status" -eq 0 ]
}
