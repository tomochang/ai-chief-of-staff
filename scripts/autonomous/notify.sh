#!/bin/bash
# notify.sh — Send triage results as Slack DM notification
# Usage: notify.sh <combined-result.json> [--escalate "message"]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
load_env

# --- Arguments ---
RESULT_FILE="${1:-}"
ESCALATE_MSG=""
TODAY_MODE=false

if [ "$RESULT_FILE" = "--escalate" ]; then
  ESCALATE_MSG="${2:-Escalation}"
  RESULT_FILE=""
elif [ "$RESULT_FILE" = "--mode" ]; then
  MODE="${2:-}"
  if [ "$MODE" = "today" ]; then
    TODAY_MODE=true
    RESULT_FILE="${3:-}"
  fi
fi

# --- Escalation mode ---
if [ -n "$ESCALATE_MSG" ]; then
  log_info "Sending escalation: $ESCALATE_MSG"
  message=":rotating_light: *Escalation*\n\n$ESCALATE_MSG\n\n_$(now_iso)_"

  if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    bash "$SCRIPT_DIR/lib/slack-api.sh" send-self "$message"
  else
    log_warn "No SLACK_BOT_TOKEN — escalation logged only"
  fi
  exit 0
fi

# --- Today mode: send briefing text directly ---
if [ "$TODAY_MODE" = "true" ]; then
  if [ -z "$RESULT_FILE" ] || [ ! -f "$RESULT_FILE" ]; then
    log_error "Briefing file not provided or not found: $RESULT_FILE"
    exit 1
  fi

  message=$(cat "$RESULT_FILE")

  if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
    log_info "Sending today briefing via Slack DM"
    response=$(bash "$SCRIPT_DIR/lib/slack-api.sh" send-self "$message" 2>/dev/null) || {
      log_error "Failed to send today briefing"
    }
    ok=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
    if [ "$ok" = "True" ]; then
      log_info "Today briefing sent successfully"
    else
      log_error "Slack API returned error: $response"
    fi
  else
    log_warn "SLACK_BOT_TOKEN not set — briefing printed to stdout only"
    echo "$message"
  fi

  echo "$message" >> "$LOG_DIR/autonomous-notifications.log"
  log_info "Today briefing logged to autonomous-notifications.log"
  exit 0
fi

# --- Normal notification ---
if [ -z "$RESULT_FILE" ] || [ ! -f "$RESULT_FILE" ]; then
  log_error "Result file not provided or not found: $RESULT_FILE"
  exit 1
fi

# Format notification message
message=$(python3 - "$RESULT_FILE" << 'PYEOF'
import json, sys
from datetime import datetime

with open(sys.argv[1]) as f:
    data = json.load(f)

s = data.get('summary', {})
ts = data.get('timestamp', datetime.now().strftime('%H:%M'))
# Extract time portion
if 'T' in ts:
    ts = ts.split('T')[1][:5]

lines = []
lines.append(f":bell: *Autonomous triage result* ({ts})")
lines.append("")

# Email summary
email_total = s.get('email_skip', 0) + s.get('email_info', 0) + s.get('email_meeting', 0) + s.get('email_action', 0)
if email_total > 0:
    parts = []
    if s.get('email_skip', 0):
        parts.append(f"skip {s['email_skip']} (archived)")
    if s.get('email_info', 0):
        parts.append(f"info {s['email_info']}")
    if s.get('email_meeting', 0):
        parts.append(f"meeting {s['email_meeting']}")
    if s.get('email_action', 0):
        parts.append(f":red_circle: action required {s['email_action']}")
    lines.append(f":email: Email: {' / '.join(parts)}")

# Slack summary
slack_total = s.get('slack_skip', 0) + s.get('slack_info', 0) + s.get('slack_action', 0)
if slack_total > 0:
    parts = []
    if s.get('slack_skip', 0):
        parts.append(f"skip {s['slack_skip']}")
    if s.get('slack_info', 0):
        parts.append(f"info {s['slack_info']}")
    if s.get('slack_action', 0):
        parts.append(f":red_circle: action required {s['slack_action']}")
    lines.append(f":speech_balloon: Slack: {' / '.join(parts)}")

# Action required details
email_actions = data.get('email', {}).get('action_required', [])
slack_actions = data.get('slack', {}).get('action_required', [])

if email_actions or slack_actions:
    lines.append("")
    lines.append(":red_circle: *Action required:*")
    n = 1
    for item in email_actions:
        sender = item.get('from', 'unknown')
        subject = item.get('subject', '(no subject)')
        summary = item.get('summary', '')
        urgency = item.get('urgency', 'medium')
        urgency_icon = ':fire:' if urgency == 'high' else ''
        lines.append(f"{n}. {urgency_icon}[Email] {sender} — {subject}")
        if summary:
            lines.append(f"   _{summary}_")
        n += 1

    for item in slack_actions:
        user = item.get('user', 'unknown')
        channel = item.get('channel_name', item.get('channel', ''))
        summary = item.get('summary', item.get('text_preview', '')[:80])
        urgency = item.get('urgency', 'medium')
        urgency_icon = ':fire:' if urgency == 'high' else ''
        lines.append(f"{n}. {urgency_icon}[Slack] #{channel} {user} — {summary}")
        n += 1

# Meeting info
meeting_items = data.get('email', {}).get('meeting_info', [])
if meeting_items:
    lines.append("")
    lines.append(":calendar: *Meeting info:*")
    for item in meeting_items:
        sender = item.get('from', '')
        subject = item.get('subject', '')
        dt = item.get('datetime', '')
        lines.append(f"- {sender}: {subject} ({dt})")

if not email_actions and not slack_actions:
    lines.append("")
    lines.append(":white_check_mark: No action required")

print('\n'.join(lines))
PYEOF
) || {
  log_error "Failed to format notification"
  message=":warning: Triage complete (notification format error). Check logs: $RESULT_FILE"
}

# Send via Slack
if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
  log_info "Sending notification via Slack DM"
  response=$(bash "$SCRIPT_DIR/lib/slack-api.sh" send-self "$message" 2>/dev/null) || {
    log_error "Failed to send Slack notification"
  }
  ok=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
  if [ "$ok" = "True" ]; then
    log_info "Notification sent successfully"
  else
    log_error "Slack API returned error: $response"
  fi
else
  log_warn "SLACK_BOT_TOKEN not set — notification printed to stdout only"
  echo "$message"
fi

# Also log the notification content
echo "$message" >> "$LOG_DIR/autonomous-notifications.log"
log_info "Notification logged to autonomous-notifications.log"

# --- Phase 4: Check for pending approvals from previous runs ---
if [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -f "$SCRIPT_DIR/lib/approval.sh" ]; then
  log_info "Checking pending approvals from previous runs..."
  approval_results=$(bash "$SCRIPT_DIR/lib/approval.sh" check 2>/dev/null) || true
  if [ -n "$approval_results" ]; then
    while IFS= read -r result; do
      [ -z "$result" ] && continue
      action=$(echo "$result" | cut -d: -f1)
      ts=$(echo "$result" | cut -d: -f2)
      case "$action" in
        APPROVED)
          log_info "Approved item $ts — queuing for execution"
          ;;
        REJECTED)
          log_info "Rejected item $ts — no action"
          ;;
        EDITED)
          log_info "Edited item $ts — queuing with edits"
          ;;
        TIMED_OUT)
          log_warn "Timed out item $ts — marking as unhandled"
          ;;
      esac
    done <<< "$approval_results"
  fi

  # Cleanup old records
  bash "$SCRIPT_DIR/lib/approval.sh" cleanup 7 2>/dev/null || true
fi
