#!/usr/bin/env bats
# Tests for scripts/chatwork-fetch.sh
# Only tests that don't require real API calls: token validation and
# bad API response handling.

setup() {
  source "$(dirname "$BATS_TEST_FILENAME")/test_helper.bash"
  setup_test_env
  SCRIPT="$PROJECT_ROOT/scripts/chatwork-fetch.sh"
}

teardown() {
  teardown_test_env
}

# ============================================================
# Token validation
# ============================================================

@test "missing CHATWORK_API_TOKEN exits 1" {
  unset CHATWORK_API_TOKEN
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"CHATWORK_API_TOKEN"* ]]
}

# ============================================================
# Bad API response (account_id null)
# ============================================================

@test "null account_id from /me exits 1" {
  export CHATWORK_API_TOKEN="test-token"

  # Mock curl: return JSON with null account_id regardless of URL
  cat > "$MOCK_BIN/curl" << 'CURLEOF'
#!/bin/bash
echo '{"account_id":null,"name":null}'
CURLEOF
  chmod +x "$MOCK_BIN/curl"

  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Failed to get account info"* ]]
}
