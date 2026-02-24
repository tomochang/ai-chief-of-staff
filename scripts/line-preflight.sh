#!/bin/bash
# line-preflight.sh — Pre-send recipient-content integrity check (gatekeeper)
#
# Usage: MATRIX_ADMIN_TOKEN=xxx bash line-preflight.sh <name> <draft text>
#
# What it does:
#   1. Fetches the recipient's chat history (last 10 messages)
#   2. Checks that the draft is contextually consistent as a reply to this person
#   3. Detects if content meant for another recipient has been mixed in
#
# Results:
#   PREFLIGHT: PASS — OK to send
#   PREFLIGHT: FAIL — Send blocked (reason displayed)
#
# Automatically called by line-send.sh. Can also be run manually.
#
# Background:
#   Created after a misdirected message incident where the LLM mixed up
#   drafts and recipients while processing multiple people in one session.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: line-preflight.sh <name> <draft text>}"
DRAFT="${2:?Usage: line-preflight.sh <name> <draft text>}"

TOKEN="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
BASE="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

echo "🛡️ Preflight check: $NAME"
echo "📝 Draft: $DRAFT"
echo "---"

# 1. Room search
ROOM_ID=$(msg_search_matrix_room "$NAME" 2>/dev/null) || {
    echo "❌ Room '$NAME' not found"
    echo "PREFLIGHT: FAIL"
    exit 1
}

msg_join_matrix_room "$ROOM_ID"

# 2. Fetch recent chat history + run integrity checks
curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE/_matrix/client/v3/rooms/$ROOM_ID/messages?dir=b&limit=10" 2>/dev/null | python3 -c "
import sys, json, re, os

draft = sys.argv[1]
target_name = sys.argv[2]
data = json.load(sys.stdin)

issues = []

# === Collect messages ===
other_msgs = []
self_msgs = []
all_msgs = []

SELF_PARTIAL = os.environ.get('YOUR_MATRIX_USER_PARTIAL', 'YOUR_MATRIX_USER_PARTIAL')
ADMIN_USER = os.environ.get('MATRIX_ADMIN_USER', '@admin:matrix.local')

for e in reversed(data.get('chunk', [])):
    if e.get('type') == 'm.room.message':
        sender = e.get('sender', '')
        body = e.get('content', {}).get('body', '')
        if not body or body in ('sticker.png', 'image.jpg'):
            continue
        if SELF_PARTIAL in sender or sender == ADMIN_USER:
            self_msgs.append(body)
            all_msgs.append(('self', body))
        elif 'bot' not in sender.lower():
            other_msgs.append(body)
            all_msgs.append(('other', body))

if not other_msgs:
    print('⚠️ No message history from recipient. Skipping integrity check')
    print('PREFLIGHT: PASS (no baseline)')
    sys.exit(0)

# === Check 1: Name mismatch ===
# Check if draft contains another person's name (not the target's)
rel_file = os.environ.get('MSG_REL_FILE', os.path.join(os.environ.get('WORKSPACE', '.'), 'private', 'relationships.md'))
all_names = []
try:
    with open(rel_file, 'r') as f:
        for line in f:
            m = re.match(r'^### (.+)', line)
            if m:
                name = m.group(1).strip()
                if name.lower() != target_name.lower() and not any(skip in name for skip in ['---', '##']):
                    all_names.append(name)
except:
    pass

for name in all_names:
    if len(name) <= 1:
        continue
    name_base = re.sub(r'(さん|ちゃん|くん|様)$', '', name)
    if len(name_base) <= 1:
        continue
    if name_base in draft or name in draft:
        in_conversation = any(name_base in msg or name in msg for msg in other_msgs + self_msgs)
        if not in_conversation:
            issues.append(f'❌ Recipient mismatch: draft contains \"{name}\" but this name does not appear in conversation with {target_name}. Possible cross-contamination from another draft.')

# === Check 2: Duplicate send ===
if self_msgs:
    last_self = self_msgs[-1] if self_msgs else ''
    norm_draft = re.sub(r'[\s\n！？。、]', '', draft)
    norm_last = re.sub(r'[\s\n！？。、]', '', last_self)
    if norm_draft == norm_last:
        issues.append(f'❌ Duplicate send: identical to the last sent message')
    elif len(norm_draft) > 5 and len(norm_last) > 5:
        common = sum(1 for c in norm_draft if c in norm_last)
        similarity = common / max(len(norm_draft), 1)
        if similarity > 0.8 and len(norm_draft) > 10:
            issues.append(f'⚠️ Similar send: {similarity*100:.0f}% similar to last sent message')

# === Check 3: Honorific consistency ===
# Detect what the recipient calls you, flag if draft references a different honorific
# Customize these patterns for your name:
# Example: if your name is 'Tomo', patterns might be 'ともくん', 'ともさん', etc.
YOUR_HONORIFIC_PATTERNS = os.environ.get('YOUR_HONORIFIC_PATTERNS', '').split(',')
YOUR_HONORIFIC_PATTERNS = [p.strip() for p in YOUR_HONORIFIC_PATTERNS if p.strip()]

if YOUR_HONORIFIC_PATTERNS:
    pattern_found = {}
    for pat in YOUR_HONORIFIC_PATTERNS:
        pattern_found[pat] = any(pat in msg for msg in other_msgs)

    # Check for 'they call me X' pattern in draft
    for pat in YOUR_HONORIFIC_PATTERNS:
        call_pattern = re.search(re.escape(pat) + r'って呼', draft)
        if call_pattern:
            if not pattern_found.get(pat, False):
                issues.append(f'❌ Honorific mismatch: draft says \"{pat}\" but {target_name} does not use this honorific. Possible cross-contamination.')

# === Output ===
if not issues:
    print(f'✅ Preflight passed: draft is consistent as a reply to {target_name}')
    print('PREFLIGHT: PASS')
else:
    has_critical = any(i.startswith('❌') for i in issues)
    for i in issues:
        print(f'  {i}')
    if has_critical:
        print(f'PREFLIGHT: FAIL')
        sys.exit(1)
    else:
        print(f'PREFLIGHT: WARN')
" "$DRAFT" "$NAME"
