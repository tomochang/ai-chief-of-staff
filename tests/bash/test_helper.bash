#!/bin/bash
# test_helper.bash — Shared setup for bats tests
# Source this in setup() to get mock PATH, temp dirs, and fixture access.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/tests/fixtures"

setup_test_env() {
  MOCK_BIN="$(mktemp -d)"
  TEST_TMPDIR="$(mktemp -d)"
  TEST_WORKSPACE="$TEST_TMPDIR/workspace"
  TEST_LOG_DIR="$TEST_TMPDIR/logs"
  TEST_LOCK_DIR="$TEST_TMPDIR/locks"

  mkdir -p "$TEST_WORKSPACE/private" "$TEST_LOG_DIR" "$TEST_LOCK_DIR"

  export PATH="$MOCK_BIN:$PATH"
  export WORKSPACE="$TEST_WORKSPACE"
  export LOG_DIR="$TEST_LOG_DIR"
  export LOCK_DIR="$TEST_LOCK_DIR"
}

teardown_test_env() {
  rm -rf "$MOCK_BIN" "$TEST_TMPDIR"
}

# Create a mock executable that outputs given text and exits with given code
# Usage: create_mock <name> <output> [exit_code]
create_mock() {
  local name="$1"
  local output="$2"
  local exit_code="${3:-0}"
  cat > "$MOCK_BIN/$name" << MOCKEOF
#!/bin/bash
echo '$output'
exit $exit_code
MOCKEOF
  chmod +x "$MOCK_BIN/$name"
}

# Create a mock that captures args to a file and outputs given text
# Usage: create_mock_capturing <name> <output> <capture_file> [exit_code]
create_mock_capturing() {
  local name="$1"
  local output="$2"
  local capture_file="$3"
  local exit_code="${4:-0}"
  cat > "$MOCK_BIN/$name" << MOCKEOF
#!/bin/bash
echo "\$@" >> "$capture_file"
echo '$output'
exit $exit_code
MOCKEOF
  chmod +x "$MOCK_BIN/$name"
}

# Create a mock curl that returns different responses based on URL pattern
# Usage: create_mock_curl <response_json>
create_mock_curl() {
  local response="$1"
  cat > "$MOCK_BIN/curl" << MOCKEOF
#!/bin/bash
echo '$response'
MOCKEOF
  chmod +x "$MOCK_BIN/curl"
}
