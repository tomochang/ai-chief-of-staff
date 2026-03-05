#!/usr/bin/env bats
# Tests for scripts/core/msg-core.sh
#
# Focuses on functions with real logic:
#   msg_check_approval, msg_require_approval,
#   msg_verify_matrix_response, msg_search_relationships,
#   msg_extract_constraints

setup() {
  source "$(dirname "$BATS_TEST_FILENAME")/test_helper.bash"
  setup_test_env

  # Copy fixtures
  cp "$FIXTURES_DIR/relationships-sample.md" "$TEST_WORKSPACE/private/relationships.md"
  cp "$FIXTURES_DIR/draft-status-sample.md" "$TEST_WORKSPACE/private/draft-status.md"

  export WORKSPACE="$TEST_WORKSPACE"
  export MSG_REL_FILE="$TEST_WORKSPACE/private/relationships.md"
  source "$PROJECT_ROOT/scripts/core/msg-core.sh"
}

teardown() {
  teardown_test_env
}

# ===========================================================================
# msg_check_approval
# ===========================================================================

@test "msg_check_approval — YES when row has ✅" {
  local draft_file="$TEST_WORKSPACE/private/draft-status.md"
  run msg_check_approval "Tanaka Taro" "$draft_file"
  [ "$status" -eq 0 ]
  [ "$output" = "YES" ]
}

@test "msg_check_approval — NO when row has ❌" {
  local draft_file="$TEST_WORKSPACE/private/draft-status.md"
  run msg_check_approval "Yamada Hanako" "$draft_file"
  [ "$status" -eq 0 ]
  [ "$output" = "NO" ]
}

@test "msg_check_approval — SKIP when file missing" {
  run msg_check_approval "Anyone" "/nonexistent/file.md"
  [ "$status" -eq 0 ]
  [ "$output" = "SKIP" ]
}

@test "msg_check_approval — case insensitive match" {
  local draft_file="$TEST_WORKSPACE/private/draft-status.md"
  run msg_check_approval "tanaka taro" "$draft_file"
  [ "$status" -eq 0 ]
  [ "$output" = "YES" ]
}

# ===========================================================================
# msg_require_approval
# ===========================================================================

@test "msg_require_approval — exit 1 when NOT approved" {
  local draft_file="$TEST_WORKSPACE/private/draft-status.md"
  run msg_require_approval "Yamada Hanako" "$draft_file"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Not approved"* ]]
}

@test "msg_require_approval — return 0 when approved" {
  local draft_file="$TEST_WORKSPACE/private/draft-status.md"
  run msg_require_approval "Tanaka Taro" "$draft_file"
  [ "$status" -eq 0 ]
}

@test "msg_require_approval — return 0 when file missing (skip)" {
  run msg_require_approval "Anyone" "/nonexistent/file.md"
  [ "$status" -eq 0 ]
}

# ===========================================================================
# msg_verify_matrix_response
# ===========================================================================

@test "msg_verify_matrix_response — extracts event_id" {
  run msg_verify_matrix_response '{"event_id":"$abc123"}'
  [ "$status" -eq 0 ]
  [ "$output" = '$abc123' ]
}

@test "msg_verify_matrix_response — exit 1 on errcode" {
  run msg_verify_matrix_response '{"errcode":"M_FORBIDDEN","error":"denied"}'
  [ "$status" -eq 1 ]
  # stdout is empty because stderr goes to /dev/null in the function
  [ -z "$output" ]
}

@test "msg_verify_matrix_response — exit 1 on parse failure" {
  run msg_verify_matrix_response 'not json at all'
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

# ===========================================================================
# msg_search_relationships
# ===========================================================================

@test "msg_search_relationships — finds matching section" {
  run msg_search_relationships "Tanaka"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Example Corp"* ]]
  [[ "$output" == *"Tanaka Taro"* ]]
}

@test "msg_search_relationships — not found outputs warning" {
  run msg_search_relationships "Nobody"
  [ "$status" -eq 0 ]
  [[ "$output" == *"not found"* ]]
}

@test "msg_search_relationships — missing file returns exit 1" {
  MSG_REL_FILE="/nonexistent/relationships.md" run msg_search_relationships "Tanaka"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not found"* ]]
}

# ===========================================================================
# msg_extract_constraints
# ===========================================================================

@test "msg_extract_constraints — extracts constraint bullets" {
  run msg_extract_constraints "Tanaka"
  [ "$status" -eq 0 ]
  [[ "$output" == *"距離を置く"* ]]
}

@test "msg_extract_constraints — shows (none) when no constraints" {
  run msg_extract_constraints "Suzuki"
  [ "$status" -eq 0 ]
  [[ "$output" == *"(none)"* ]]
}

# ===========================================================================
# msg_load_voice_examples
# ===========================================================================

@test "msg_load_voice_examples — loads matching category" {
  export MSG_VOICE_EXAMPLES="$FIXTURES_DIR/voice-examples-sample.md"
  run msg_load_voice_examples "partner"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Voice Examples"* ]]
  [[ "$output" == *"テスト例1"* ]]
  [[ "$output" == *"テスト例3"* ]]
}

@test "msg_load_voice_examples — excludes non-matching category" {
  export MSG_VOICE_EXAMPLES="$FIXTURES_DIR/voice-examples-sample.md"
  run msg_load_voice_examples "partner"
  [ "$status" -eq 0 ]
  # business-casual example should NOT appear
  [[ "$output" != *"テスト例2"* ]]
}

@test "msg_load_voice_examples — returns empty for unknown category" {
  export MSG_VOICE_EXAMPLES="$FIXTURES_DIR/voice-examples-sample.md"
  run msg_load_voice_examples "nonexistent-category"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "msg_load_voice_examples — graceful when file missing" {
  export MSG_VOICE_EXAMPLES="/nonexistent/voice-examples.md"
  run msg_load_voice_examples "partner"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ===========================================================================
# msg_detect_voice_category
# ===========================================================================

@test "msg_detect_voice_category — detects partner for girlfriend" {
  run msg_detect_voice_category "関係: 交際中の彼女"
  [ "$status" -eq 0 ]
  [ "$output" = "partner" ]
}

@test "msg_detect_voice_category — detects business for client" {
  run msg_detect_voice_category "関係: 取引先の担当者"
  [ "$status" -eq 0 ]
  [ "$output" = "business" ]
}

@test "msg_detect_voice_category — defaults to business-casual" {
  run msg_detect_voice_category "関係: 知人"
  [ "$status" -eq 0 ]
  [ "$output" = "business-casual" ]
}

# ===========================================================================
# msg_validate_draft
# ===========================================================================

@test "msg_validate_draft — passes good draft" {
  run msg_validate_draft "行きましょう。水木どっちか空いてます" "来週飲みに行きませんか？" 100
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "msg_validate_draft — detects empathy-parrot pattern" {
  run msg_validate_draft "なるほど、いいですね！" "今日カフェ行ったよ" 100
  [ "$status" -eq 1 ]
  [[ "$output" == *"共感オウム返し"* ]]
}

@test "msg_validate_draft — detects question-ending pattern" {
  run msg_validate_draft "いいね。何食べたの？" "ランチ美味しかった" 100
  [ "$status" -eq 1 ]
  [[ "$output" == *"質問終わり"* ]]
}

@test "msg_validate_draft — detects verbose draft" {
  local long_draft="これはとても長い返信です。相手のメッセージに対して丁寧に返答しています。しかしながらこのような長い文章は不適切です。もっと簡潔にすべきです。以上。"
  run msg_validate_draft "$long_draft" "元気？" 20
  [ "$status" -eq 1 ]
  [[ "$output" == *"冗長"* ]]
}

# ===========================================================================
# msg_rotate_examples
# ===========================================================================

@test "msg_rotate_examples — no-op when <= 5 examples" {
  local tmpfile="$TEST_TMPDIR/rotate-test.md"
  cp "$FIXTURES_DIR/voice-examples-sample.md" "$tmpfile"
  run msg_rotate_examples "partner" "$tmpfile"
  [ "$status" -eq 0 ]
  # File should be unchanged (only 2 partner examples)
  diff -q "$tmpfile" "$FIXTURES_DIR/voice-examples-sample.md"
}
