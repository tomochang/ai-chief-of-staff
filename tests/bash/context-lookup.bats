#!/usr/bin/env bats
# Tests for scripts/context-lookup.sh
# Tests keyword validation, file searching, missing-file handling, and
# calendar (gog) invocation.

setup() {
  source "$(dirname "$BATS_TEST_FILENAME")/test_helper.bash"
  setup_test_env
  SCRIPT="$PROJECT_ROOT/scripts/context-lookup.sh"
  export WORKSPACE="$TEST_WORKSPACE"
}

teardown() {
  teardown_test_env
}

# ============================================================
# No keyword exits 1
# ============================================================

@test "no keyword argument exits 1" {
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

# ============================================================
# Searches relationships.md when present
# ============================================================

@test "finds matches in relationships.md" {
  # Copy the sample fixture into the workspace
  cp "$FIXTURES_DIR/relationships-sample.md" "$TEST_WORKSPACE/private/relationships.md"

  # Mock gog so the calendar section doesn't fail
  create_mock "gog" ""

  run bash "$SCRIPT" "Tanaka"
  [ "$status" -eq 0 ]
  # grep -n -i returns matching lines; "Tanaka Taro" is on line 1
  [[ "$output" == *"Tanaka Taro"* ]]
}

# ============================================================
# Handles missing files gracefully
# ============================================================

@test "reports file not found for missing files" {
  # WORKSPACE points to empty dir (no private/relationships.md or private/todo.md)
  # Remove the files that setup_test_env might have created
  rm -f "$TEST_WORKSPACE/private/relationships.md"
  rm -f "$TEST_WORKSPACE/private/todo.md"

  # Mock gog so the calendar section doesn't fail
  create_mock "gog" ""

  run bash "$SCRIPT" "anything"
  [ "$status" -eq 0 ]
  [[ "$output" == *"(file not found:"* ]]
}

# ============================================================
# Calendar section runs gog
# ============================================================

@test "calendar section invokes gog" {
  # Create relationships and todo files to avoid early noise
  echo "No matches here" > "$TEST_WORKSPACE/private/relationships.md"
  echo "No matches here" > "$TEST_WORKSPACE/private/todo.md"

  # Mock gog to return calendar text containing the keyword
  GOG_CAPTURE="$TEST_TMPDIR/gog_calls.log"
  create_mock_capturing "gog" "2026-03-05 10:00 Meeting with Tanaka" "$GOG_CAPTURE"

  run bash "$SCRIPT" "Tanaka"
  [ "$status" -eq 0 ]

  # Verify gog was called
  [ -f "$GOG_CAPTURE" ]

  # Verify the calendar output appears (grep -i in the script matches "Tanaka")
  [[ "$output" == *"Meeting with Tanaka"* ]]
}
