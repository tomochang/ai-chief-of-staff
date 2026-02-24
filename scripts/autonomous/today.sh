#!/bin/bash
# today.sh — Autonomous 5-channel triage + unified briefing
# Replaces triage.sh with: Email + Slack + LINE + Messenger + Calendar/Todo
# Classifies messages, auto-archives skip emails, sends unified briefing via Slack DM

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
load_env

log_info "=== Today started ==="

# --- Configuration ---
EMAIL_MAX=$(config_get "today.email.max_results" "20")
EMAIL_QUERY=$(config_get "today.email.search_query" "is:unread -category:promotions -category:social")
AUTO_ARCHIVE=$(config_get "today.email.auto_archive_skip" "true")
SLACK_HOURS=$(config_get "today.slack.lookback_hours" "4")
SLACK_COUNT=$(config_get "today.slack.mention_count" "20")
LINE_HOURS=$(config_get "today.line.sync_hours" "4")
LINE_ENABLED=$(config_get "today.line.enabled" "true")
MESSENGER_ENABLED=$(config_get "today.messenger.enabled" "true")
CALENDAR_ENABLED=$(config_get "today.calendar.enabled" "true")
CLAUDE_MAX_TURNS=$(config_get "today.claude.max_turns" "15")
CLAUDE_TOOLS=$(config_get "today.claude.allowed_tools" "Bash(gog *),Read")
BRIEFING_MAX_TURNS=$(config_get "today.claude.briefing_max_turns" "5")

# --- Output directory for this run ---
RUN_ID=$(date '+%Y%m%d-%H%M%S')
RUN_DIR="$LOG_DIR/triage-runs/$RUN_ID"
mkdir -p "$RUN_DIR"

# --- Helper: extract JSON from claude output ---
extract_json() {
  python3 -c "
import json, sys, re
try:
    data = json.load(sys.stdin)
    result = data.get('result', data.get('content', ''))
    if isinstance(result, str):
        match = re.search(r'\{[\s\S]*\}', result)
        if match:
            parsed = json.loads(match.group())
            print(json.dumps(parsed, ensure_ascii=False))
        else:
            print(json.dumps({'raw': result}, ensure_ascii=False))
    else:
        print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    print(json.dumps({'error': str(e)}, ensure_ascii=False))
" 2>/dev/null || echo '{"error": "parse failed"}'
}

# --- Helper: extract plain text from claude output ---
extract_text() {
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    result = data.get('result', data.get('content', ''))
    if isinstance(result, str):
        print(result)
    else:
        print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    print(str(e))
" 2>/dev/null || cat
}

# ==========================================================
# Phase 1: Parallel data fetch + classification
# ==========================================================
log_info "Phase 1: Parallel data fetch (email, slack, line, messenger, calendar)"

# --- 1a. Email Triage (background) ---
(
  log_info "  1a: Email triage starting"

  EMAIL_PROMPT="Fetch unread emails and classify them.

Steps:
1. Use gog gmail search \"$EMAIL_QUERY\" --max $EMAIL_MAX --json to fetch unread emails
2. For emails that look like action_required, read details with gog gmail read <threadId> --json
3. Classify all emails according to the classification rules
4. Auto-archive skip emails: gog gmail thread modify \"<threadId>\" --remove \"INBOX,UNREAD\" --force"

  if [ "$AUTO_ARCHIVE" != "true" ]; then
    EMAIL_PROMPT="$EMAIL_PROMPT
NOTE: Do not archive (dry run mode)"
  fi

  EMAIL_PROMPT="$EMAIL_PROMPT

Output results in JSON format."

  EMAIL_SYSTEM_PROMPT=$(cat "$SCRIPT_DIR/prompts/triage-email.md")

  email_result=$(run_claude \
    "$EMAIL_PROMPT" \
    "$CLAUDE_MAX_TURNS" \
    "$CLAUDE_TOOLS" \
    "$EMAIL_SYSTEM_PROMPT") || {
    log_error "  1a: Email triage failed"
    email_result='{"error": "email triage failed"}'
  }

  echo "$email_result" | extract_json > "$RUN_DIR/email-result.json"
  log_info "  1a: Email triage complete"
) &
pid_email=$!

# --- 1b. Slack Triage (background) ---
(
  log_info "  1b: Slack triage starting"

  if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    slack_mentions=$(bash "$SCRIPT_DIR/lib/slack-api.sh" mentions "$SLACK_HOURS" "$SLACK_COUNT" 2>/dev/null || echo '{"ok":false}')
    slack_dms=$(bash "$SCRIPT_DIR/lib/slack-api.sh" dms "$SLACK_HOURS" 2>/dev/null || echo '[]')

    SLACK_SYSTEM_PROMPT=$(cat "$SCRIPT_DIR/prompts/triage-slack.md")

    SLACK_PROMPT="Classify the following Slack messages.

Mentions:
$slack_mentions

DMs:
$slack_dms"

    slack_result=$(run_claude \
      "$SLACK_PROMPT" \
      "5" \
      "Read" \
      "$SLACK_SYSTEM_PROMPT") || {
      log_error "  1b: Slack triage failed"
      slack_result='{"error": "slack triage failed"}'
    }

    echo "$slack_result" | extract_json > "$RUN_DIR/slack-result.json"
  else
    log_warn "  1b: SLACK_BOT_TOKEN not set, skipping Slack triage"
    echo '{"skip":[],"info_only":[],"action_required":[],"stats":{"total":0,"skip":0,"info_only":0,"action_required":0}}' > "$RUN_DIR/slack-result.json"
  fi
  log_info "  1b: Slack triage complete"
) &
pid_slack=$!

# --- 1c. LINE Triage (background) ---
(
  log_info "  1c: LINE triage starting"

  if [ "$LINE_ENABLED" = "true" ] && [ -n "${MATRIX_ADMIN_TOKEN:-}" ]; then
    line_data=$(bash "$CLAWD_DIR/scripts/line-sync.sh" --since "$LINE_HOURS" --json 2>/dev/null) || {
      log_warn "  1c: line-sync.sh failed (VPS down?), skipping LINE"
      echo '{"skip":[],"info_only":[],"action_required":[],"stats":{"total":0,"skip":0,"info_only":0,"action_required":0}}' > "$RUN_DIR/line-result.json"
      exit 0
    }

    if [ -z "$line_data" ] || [ "$line_data" = "[]" ]; then
      log_info "  1c: No LINE messages"
      echo '{"skip":[],"info_only":[],"action_required":[],"stats":{"total":0,"skip":0,"info_only":0,"action_required":0}}' > "$RUN_DIR/line-result.json"
    else
      LINE_SYSTEM_PROMPT=$(cat "$SCRIPT_DIR/prompts/triage-line.md")

      LINE_PROMPT="Classify the following LINE messages.

$line_data"

      line_result=$(run_claude \
        "$LINE_PROMPT" \
        "3" \
        "Read" \
        "$LINE_SYSTEM_PROMPT") || {
        log_error "  1c: LINE triage failed"
        line_result='{"error": "line triage failed"}'
      }

      echo "$line_result" | extract_json > "$RUN_DIR/line-result.json"
    fi
  else
    log_info "  1c: LINE disabled or MATRIX_ADMIN_TOKEN not set, skipping"
    echo '{"skip":[],"info_only":[],"action_required":[],"stats":{"total":0,"skip":0,"info_only":0,"action_required":0}}' > "$RUN_DIR/line-result.json"
  fi
  log_info "  1c: LINE triage complete"
) &
pid_line=$!

# --- 1d. Messenger Triage via Chrome CDP (background) ---
(
  log_info "  1d: Messenger triage starting (Chrome CDP)"

  EMPTY_RESULT='{"skip":[],"info_only":[],"action_required":[],"stats":{"total":0,"skip":0,"info_only":0,"action_required":0}}'

  if [ "$MESSENGER_ENABLED" = "true" ]; then
    messenger_raw=$(node "$CLAWD_DIR/scripts/messenger-checker/local-check.js" 2>/dev/null) || {
      log_warn "  1d: local-check.js failed, skipping Messenger"
      echo "$EMPTY_RESULT" > "$RUN_DIR/messenger-result.json"
      exit 0
    }

    if [ -z "$messenger_raw" ]; then
      log_info "  1d: No Messenger output"
      echo "$EMPTY_RESULT" > "$RUN_DIR/messenger-result.json"
    else
      # local-check.js outputs pre-classified JSON with actionRequired/review/skip
      # Convert to triage format (skip/info_only/action_required)
      echo "$messenger_raw" > "$RUN_DIR/messenger-raw.json"

      python3 - "$RUN_DIR/messenger-raw.json" << 'PYEOF' > "$RUN_DIR/messenger-result.json" 2>/dev/null || echo "$EMPTY_RESULT" > "$RUN_DIR/messenger-result.json"
import json, sys

with open(sys.argv[1]) as f:
    data = json.load(f)

skip = []
for item in data.get('skip', []):
    skip.append({
        'room': item.get('name', ''),
        'sender': item.get('name', ''),
        'body': item.get('preview', ''),
        'reason': ', '.join(item.get('skipReasons', ['auto']))
    })

info_only = []
for item in data.get('review', []):
    info_only.append({
        'room': item.get('name', ''),
        'sender': item.get('name', ''),
        'body': item.get('preview', ''),
        'summary': item.get('preview', '')[:80]
    })

action_required = []
for item in data.get('actionRequired', []):
    reasons = item.get('actionReasons', [])
    urgency = 'high' if 'mentioned' in reasons else 'medium'
    action_required.append({
        'room': item.get('name', ''),
        'sender': item.get('name', ''),
        'body': item.get('preview', ''),
        'summary': item.get('preview', '')[:80],
        'urgency': urgency
    })

result = {
    'skip': skip,
    'info_only': info_only,
    'action_required': action_required,
    'stats': {
        'total': len(skip) + len(info_only) + len(action_required),
        'skip': len(skip),
        'info_only': len(info_only),
        'action_required': len(action_required)
    }
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PYEOF
    fi
  else
    log_info "  1d: Messenger disabled, skipping"
    echo "$EMPTY_RESULT" > "$RUN_DIR/messenger-result.json"
  fi
  log_info "  1d: Messenger triage complete"
) &
pid_messenger=$!

# --- 1e. Calendar + Todo (background) ---
(
  log_info "  1e: Calendar + Todo fetch starting"

  calendar_data="[]"
  todo_data=""

  if [ "$CALENDAR_ENABLED" = "true" ]; then
    today_date=$(date '+%Y-%m-%d')
    # Fetch today's events — configure YOUR_WORK_EMAIL and YOUR_EMAIL in .env or below
    WORK_EMAIL="${WORK_EMAIL:-YOUR_WORK_EMAIL}"
    PERSONAL_EMAIL="${PERSONAL_EMAIL:-YOUR_EMAIL}"

    calendar_data=$(gog cal list primary -a "$WORK_EMAIL" \
      --from "${today_date}T00:00:00+09:00" \
      --to "${today_date}T23:59:59+09:00" \
      --json 2>/dev/null || echo '[]')

    # Also fetch personal calendar
    personal_cal=$(gog cal list primary -a "$PERSONAL_EMAIL" \
      --from "${today_date}T00:00:00+09:00" \
      --to "${today_date}T23:59:59+09:00" \
      --json 2>/dev/null || echo '[]')

    # Merge calendars (use temp files to avoid quoting issues)
    echo "$calendar_data" > "$RUN_DIR/cal-work.json"
    echo "$personal_cal" > "$RUN_DIR/cal-personal.json"
    calendar_data=$(python3 - "$RUN_DIR/cal-work.json" "$RUN_DIR/cal-personal.json" << 'PYEOF' 2>/dev/null || echo '[]'
import json, sys
try:
    with open(sys.argv[1]) as f:
        work = json.load(f)
    with open(sys.argv[2]) as f:
        personal = json.load(f)
    if not isinstance(work, list): work = []
    if not isinstance(personal, list): personal = []
    merged = work + personal
    merged.sort(key=lambda e: e.get('start', {}).get('dateTime', e.get('start', {}).get('date', '')))
    print(json.dumps(merged, ensure_ascii=False))
except:
    print('[]')
PYEOF
)
  fi

  # Read todo file
  TODO_FILE="$CLAWD_DIR/private/todo.md"
  if [ -f "$TODO_FILE" ]; then
    todo_data=$(cat "$TODO_FILE" 2>/dev/null || echo "")
  fi

  # Save calendar + todo (use temp files to avoid quoting issues)
  echo "$calendar_data" > "$RUN_DIR/calendar-raw.json"
  echo "$todo_data" > "$RUN_DIR/todo-raw.txt"

  python3 - "$RUN_DIR/calendar-raw.json" "$RUN_DIR/todo-raw.txt" << 'PYEOF' > "$RUN_DIR/calendar-todo.json" 2>/dev/null || echo '{"calendar":[],"todo":""}' > "$RUN_DIR/calendar-todo.json"
import json, sys
try:
    with open(sys.argv[1]) as f:
        cal = json.load(f)
    if not isinstance(cal, list):
        cal = []
except:
    cal = []
try:
    with open(sys.argv[2]) as f:
        todo = f.read()[:2000]
except:
    todo = ""
print(json.dumps({"calendar": cal, "todo": todo}, ensure_ascii=False, indent=2))
PYEOF

  log_info "  1e: Calendar + Todo fetch complete"
) &
pid_calendar=$!

# --- Wait for all Phase 1 jobs ---
log_info "Waiting for all Phase 1 jobs..."
wait_failed=0
wait $pid_email    || { log_error "Email job failed"; wait_failed=1; }
wait $pid_slack    || { log_error "Slack job failed"; wait_failed=1; }
wait $pid_line     || { log_error "LINE job failed"; wait_failed=1; }
wait $pid_messenger || { log_error "Messenger job failed"; wait_failed=1; }
wait $pid_calendar || { log_error "Calendar job failed"; wait_failed=1; }

if [ "$wait_failed" = "1" ]; then
  log_warn "Some Phase 1 jobs failed — continuing with available results"
fi

log_info "Phase 1 complete"

# ==========================================================
# Phase 2: Combine results + generate briefing
# ==========================================================
log_info "Phase 2: Generating unified briefing"

# Combine all results into a single JSON
combined=$(python3 - "$RUN_DIR" "$RUN_ID" << 'PYEOF'
import json, sys, os
from datetime import datetime

run_dir = sys.argv[1]
run_id = sys.argv[2]

def load_json(filename):
    filepath = os.path.join(run_dir, filename)
    try:
        with open(filepath) as f:
            return json.load(f)
    except:
        return {}

email = load_json('email-result.json')
slack = load_json('slack-result.json')
line = load_json('line-result.json')
messenger = load_json('messenger-result.json')
cal_todo = load_json('calendar-todo.json')

has_action = (
    len(email.get('action_required', [])) > 0 or
    len(slack.get('action_required', [])) > 0 or
    len(line.get('action_required', [])) > 0 or
    len(messenger.get('action_required', [])) > 0
)

result = {
    'run_id': run_id,
    'timestamp': datetime.now().strftime('%Y-%m-%dT%H:%M:%S%z'),
    'email': email,
    'slack': slack,
    'line': line,
    'messenger': messenger,
    'calendar': cal_todo.get('calendar', []),
    'todo': cal_todo.get('todo', ''),
    'has_action_required': has_action,
    'summary': {
        'email_skip': len(email.get('skip', [])),
        'email_info': len(email.get('info_only', [])),
        'email_meeting': len(email.get('meeting_info', [])),
        'email_action': len(email.get('action_required', [])),
        'slack_skip': len(slack.get('skip', [])),
        'slack_info': len(slack.get('info_only', [])),
        'slack_action': len(slack.get('action_required', [])),
        'line_skip': len(line.get('skip', [])),
        'line_info': len(line.get('info_only', [])),
        'line_action': len(line.get('action_required', [])),
        'messenger_skip': len(messenger.get('skip', [])),
        'messenger_info': len(messenger.get('info_only', [])),
        'messenger_action': len(messenger.get('action_required', [])),
        'calendar_count': len(cal_todo.get('calendar', [])),
    }
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PYEOF
) || {
  log_error "Failed to combine results"
  combined='{"error": "combine failed"}'
}

echo "$combined" > "$RUN_DIR/combined.json"

# Generate briefing via claude -p
BRIEFING_SYSTEM_PROMPT=$(cat "$SCRIPT_DIR/prompts/today-briefing.md")

BRIEFING_PROMPT="Generate a unified briefing from the following triage results.

$combined"

briefing_result=$(run_claude \
  "$BRIEFING_PROMPT" \
  "$BRIEFING_MAX_TURNS" \
  "Read" \
  "$BRIEFING_SYSTEM_PROMPT") || {
  log_error "Briefing generation failed"
  briefing_result=""
}

# Extract briefing text
briefing_text=$(echo "$briefing_result" | extract_text)

if [ -z "$briefing_text" ]; then
  log_warn "Briefing text empty — falling back to summary-only notification"
  briefing_text=""
fi

echo "$briefing_text" > "$RUN_DIR/briefing.txt"
log_info "Phase 2 complete"

# ==========================================================
# Phase 3: Notify via Slack DM
# ==========================================================
log_info "Phase 3: Sending notification"

if [ -n "$briefing_text" ]; then
  # Use today mode: send briefing text directly
  bash "$SCRIPT_DIR/notify.sh" --mode today "$RUN_DIR/briefing.txt"
else
  # Fallback: use legacy notification format with combined.json
  has_action=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('has_action_required', False))" 2>/dev/null || echo "False")
  if [ "$has_action" = "True" ]; then
    bash "$SCRIPT_DIR/notify.sh" "$RUN_DIR/combined.json"
  else
    log_info "No action required and no briefing — notification skipped"
  fi
fi

# Log summary
email_action=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary',{}).get('email_action',0))" 2>/dev/null || echo "0")
slack_action=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary',{}).get('slack_action',0))" 2>/dev/null || echo "0")
line_action=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary',{}).get('line_action',0))" 2>/dev/null || echo "0")
messenger_action=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary',{}).get('messenger_action',0))" 2>/dev/null || echo "0")
email_skip=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary',{}).get('email_skip',0))" 2>/dev/null || echo "0")
cal_count=$(echo "$combined" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary',{}).get('calendar_count',0))" 2>/dev/null || echo "0")

log_info "=== Today complete === email: skip=$email_skip action=$email_action | slack: action=$slack_action | line: action=$line_action | messenger: action=$messenger_action | calendar: $cal_count events"

# Output combined result to stdout for piping
echo "$combined"
