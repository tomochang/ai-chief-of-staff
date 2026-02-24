#!/bin/bash
# morning-briefing.sh — Morning briefing → Slack DM notification
# Combines today's calendar, pending todos, and overnight triage results

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
load_env

log_info "=== Morning briefing started ==="

# --- 1. Fetch today's calendar ---
log_info "Fetching today's calendar..."
today=$(date '+%Y-%m-%d')
calendar_json=$(gog calendar events --from "$today" --to "$today" --all --max 30 --json 2>/dev/null || echo "[]")

calendar_section=$(echo "$calendar_json" | python3 -c "
import json, sys
try:
    events = json.load(sys.stdin)
    if not events or (isinstance(events, list) and len(events) == 0):
        print(':calendar: *Today schedule:* None')
    else:
        if isinstance(events, dict):
            events = events.get('items', events.get('events', []))
        lines = [':calendar: *Today schedule:*']
        for e in events:
            start = e.get('start', {})
            time_str = ''
            if 'dateTime' in start:
                dt = start['dateTime']
                if 'T' in dt:
                    time_str = dt.split('T')[1][:5]
                else:
                    time_str = 'All day'
            elif 'date' in start:
                time_str = 'All day'
            summary = e.get('summary', '(No title)')
            location = e.get('location', '')
            loc_str = f' ({location})' if location else ''
            lines.append(f'  {time_str} {summary}{loc_str}')
        print('\n'.join(lines))
except Exception as ex:
    print(f':calendar: *Today schedule:* Error ({ex})')
" 2>/dev/null || echo ":calendar: *Today schedule:* Error")

# --- 2. Fetch pending todos ---
log_info "Fetching pending todos..."
todo_file="$CLAWD_DIR/private/todo.md"
todo_section=""
if [ -f "$todo_file" ]; then
  todo_section=$(python3 -c "
import sys

with open('$todo_file', 'r') as f:
    content = f.read()

# Extract action items (lines with - [ ] or checkboxes)
lines = content.split('\n')
pending = []
in_action_section = False
for line in lines:
    stripped = line.strip()
    if '# ' in line and ('action' in line.lower() or 'todo' in line.lower() or 'task' in line.lower()):
        in_action_section = True
        continue
    if in_action_section and stripped.startswith('#'):
        in_action_section = False
    if '- [ ]' in stripped or '- ⏳' in stripped or '- 🔴' in stripped:
        pending.append(stripped)

if pending:
    result = [':memo: *Pending tasks:*']
    for p in pending[:10]:
        result.append(f'  {p}')
    if len(pending) > 10:
        result.append(f'  ...and {len(pending)-10} more')
    print('\n'.join(result))
else:
    print(':memo: *Pending tasks:* None')
" 2>/dev/null || echo ":memo: *Pending tasks:* Error")
else
  todo_section=":memo: *Pending tasks:* File not found"
fi

# --- 3. Overnight triage action_required ---
log_info "Checking overnight triage results..."
triage_section=$(python3 -c "
import json, os, glob
from datetime import datetime, timedelta

runs_dir = '$CLAWD_DIR/logs/triage-runs'
if not os.path.isdir(runs_dir):
    print(':robot_face: *Overnight triage:* No runs')
    exit(0)

# Find runs from the last 12 hours
now = datetime.now()
cutoff = now - timedelta(hours=12)
action_items = []
total_skip = 0
total_runs = 0

for run_dir in sorted(glob.glob(os.path.join(runs_dir, '*')), reverse=True):
    dirname = os.path.basename(run_dir)
    try:
        run_time = datetime.strptime(dirname, '%Y%m%d-%H%M%S')
    except:
        continue
    if run_time < cutoff:
        break
    total_runs += 1
    combined_file = os.path.join(run_dir, 'combined.json')
    if os.path.isfile(combined_file):
        with open(combined_file) as f:
            data = json.load(f)
        s = data.get('summary', {})
        total_skip += s.get('email_skip', 0)
        for item in data.get('email', {}).get('action_required', []):
            action_items.append(('[Email] ' + item.get('from', '?') + ' — ' + item.get('subject', '?'), item.get('summary', '')))
        for item in data.get('slack', {}).get('action_required', []):
            action_items.append(('[Slack] ' + item.get('user', '?') + ' — ' + item.get('summary', ''), ''))

lines = [f':robot_face: *Overnight triage:* {total_runs} runs, {total_skip} skipped']
if action_items:
    lines.append(f':red_circle: *Pending {len(action_items)} items:*')
    for title, summary in action_items:
        lines.append(f'  {title}')
        if summary:
            lines.append(f'    _{summary}_')
else:
    lines.append('  No action required :white_check_mark:')

print('\n'.join(lines))
" 2>/dev/null || echo ":robot_face: *Overnight triage:* Error")

# --- 4. Pending approvals ---
log_info "Checking pending approvals..."
pending_dir="$CLAWD_DIR/logs/pending-approvals"
approval_section=""
if [ -d "$pending_dir" ]; then
  pending_count=$(find "$pending_dir" -name "*.json" -exec python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
if d.get('status') == 'pending':
    print('1')
" {} \; 2>/dev/null | wc -l | tr -d ' ')
  if [ "$pending_count" -gt 0 ]; then
    approval_section=":hourglass: *Pending approvals:* ${pending_count} items"
  fi
fi

# --- Assemble & send ---
message=":sunrise: *Good morning* ($(date '+%m/%d %a'))

$calendar_section

$todo_section

$triage_section"

if [ -n "$approval_section" ]; then
  message="$message

$approval_section"
fi

log_info "Sending morning briefing..."

if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
  response=$(bash "$SCRIPT_DIR/lib/slack-api.sh" send-self "$message" 2>/dev/null) || {
    log_error "Failed to send morning briefing"
  }
  ok=$(echo "$response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
  if [ "$ok" = "True" ]; then
    log_info "Morning briefing sent successfully"
  else
    log_error "Slack API error: $response"
  fi
else
  echo "$message"
fi

echo "$message" >> "$LOG_DIR/autonomous-notifications.log"
log_info "=== Morning briefing complete ==="
