#!/usr/bin/env bats
# Tests for scripts/autonomous/lib/common.sh
# Tests config_get, acquire_lock, release_lock, json_length, json_get, logging

setup() {
  source "$(dirname "$BATS_TEST_FILENAME")/test_helper.bash"
  setup_test_env

  # Set CONFIG_FILE before sourcing so config_get uses our fixture
  export CONFIG_FILE="$FIXTURES_DIR/config-sample.json"

  # WORKSPACE controls CLAWD_DIR derivation; LOG_DIR/LOCK_DIR are set by
  # test_helper but common.sh recomputes LOG_DIR from CLAWD_DIR and
  # hardcodes LOCK_DIR. We override after sourcing.
  source "$PROJECT_ROOT/scripts/autonomous/lib/common.sh"

  # Override paths that common.sh computed
  LOG_DIR="$TEST_LOG_DIR"
  LOCK_DIR="$TEST_LOCK_DIR"
}

teardown() {
  teardown_test_env
}

# ============================================================
# config_get
# ============================================================

@test "config_get: top-level string value" {
  run config_get "max_budget_usd"
  [ "$status" -eq 0 ]
  [ "$output" = "0.50" ]
}

@test "config_get: nested dot notation" {
  run config_get "triage.interval_minutes"
  [ "$status" -eq 0 ]
  [ "$output" = "30" ]
}

@test "config_get: deeply nested key" {
  run config_get "triage.email.max_results"
  [ "$status" -eq 0 ]
  [ "$output" = "20" ]
}

@test "config_get: missing key returns default" {
  run config_get "nonexistent" "fallback"
  [ "$status" -eq 0 ]
  [ "$output" = "fallback" ]
}

@test "config_get: missing config file returns default" {
  CONFIG_FILE="/tmp/does-not-exist-$$.json"
  run config_get "foo" "bar"
  [ "$status" -eq 0 ]
  [ "$output" = "bar" ]
}

@test "config_get: boolean normalized to lowercase" {
  run config_get "hitl.low_risk_auto"
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

# ============================================================
# acquire_lock / release_lock
# ============================================================

@test "acquire_lock: creates lock and pid files" {
  run acquire_lock "testlock"
  [ "$status" -eq 0 ]
  [ -f "$LOCK_DIR/testlock.lock" ]
  [ -f "$LOCK_DIR/testlock.pid" ]
}

@test "acquire_lock: fails when active PID holds lock" {
  # Create a lock held by the current shell (which is alive)
  echo "$$" > "$LOCK_DIR/held.pid"
  touch "$LOCK_DIR/held.lock"

  run acquire_lock "held"
  [ "$status" -eq 1 ]
}

@test "acquire_lock: cleans stale lock with dead PID" {
  # Use a PID that almost certainly does not exist
  echo "99999" > "$LOCK_DIR/stale.pid"
  touch "$LOCK_DIR/stale.lock"

  # Verify 99999 is not running (skip test if it is)
  if kill -0 99999 2>/dev/null; then
    skip "PID 99999 unexpectedly exists"
  fi

  run acquire_lock "stale"
  [ "$status" -eq 0 ]
  # After acquiring, pid file should contain our PID
  [ "$(cat "$LOCK_DIR/stale.pid")" = "$$" ]
}

@test "release_lock: removes lock and pid files" {
  acquire_lock "rel"
  [ -f "$LOCK_DIR/rel.lock" ]

  release_lock "rel"
  [ ! -f "$LOCK_DIR/rel.lock" ]
  [ ! -f "$LOCK_DIR/rel.pid" ]
}

# ============================================================
# json_length
# ============================================================

@test "json_length: counts array elements" {
  run json_length '{"items":[1,2,3]}' "items"
  [ "$status" -eq 0 ]
  [ "$output" = "3" ]
}

@test "json_length: missing key returns 0" {
  run json_length '{"a":1}' "nope"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

# ============================================================
# json_get
# ============================================================

@test "json_get: nested value" {
  run json_get '{"a":{"b":"hello"}}' "a.b"
  [ "$status" -eq 0 ]
  [ "$output" = "hello" ]
}

@test "json_get: missing path returns empty" {
  run json_get '{"a":1}' "x.y"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# ============================================================
# Logging
# ============================================================

@test "log_info: writes message to log file" {
  log_info "hello from test"
  grep -q "hello from test" "$LOG_DIR/autonomous.log"
}

@test "log_error: writes to stderr and log file" {
  run log_error "something broke"
  # run captures stderr in output when merged; check log file directly
  [ "$status" -eq 0 ]
  grep -q "something broke" "$LOG_DIR/autonomous.log"
}

@test "log_debug: suppressed when DEBUG unset" {
  unset DEBUG
  log_debug "secret debug"
  # Should NOT appear in the log
  ! grep -q "secret debug" "$LOG_DIR/autonomous.log"
}

@test "log_debug: writes when DEBUG=1" {
  DEBUG=1
  log_debug "visible debug"
  grep -q "visible debug" "$LOG_DIR/autonomous.log"
}
