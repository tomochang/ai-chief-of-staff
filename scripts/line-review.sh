#!/bin/bash
# line-review.sh — Draft style validator
# Usage: line-review.sh <name> <draft text>
#
# Compares draft against YOUR_NAME's past writing style and FAILs if divergent.
# Rule: Cannot send without PASS.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core/msg-core.sh"

NAME="${1:?Usage: line-review.sh <name> <draft text>}"
DRAFT="${2:?Usage: line-review.sh <name> <draft text>}"

TOKEN="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
BASE="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

echo "🔍 Draft review: $NAME"
echo "📝 Draft: $DRAFT"
echo "---"

# 0. Preflight check (recipient-content integrity) — block early at review time
echo "🛡️ Preflight check..."
PREFLIGHT_OUT=$(MATRIX_ADMIN_TOKEN="$TOKEN" bash "$SCRIPT_DIR/line-preflight.sh" "$NAME" "$DRAFT" 2>&1) || true
echo "$PREFLIGHT_OUT"
echo "---"

if echo "$PREFLIGHT_OUT" | grep -q "PREFLIGHT: FAIL"; then
  echo ""
  echo "RESULT: FAIL (preflight)"
  exit 1
fi

# 1. Get room and history
ROOM_ID=$(msg_search_matrix_room "$NAME" 2>/dev/null) || {
    echo "⚠️ Room not found. Skipping review"
    echo "RESULT: SKIP"
    exit 0
}

msg_join_matrix_room "$ROOM_ID"

# 2. Get history + run review
curl -s -H "Authorization: Bearer $TOKEN" \
    "$BASE/_matrix/client/v3/rooms/$ROOM_ID/messages?dir=b&limit=30" 2>/dev/null | python3 -c "
import sys, json, re, unicodedata

draft = sys.argv[1]
name = sys.argv[2]
data = json.load(sys.stdin)

# === Helper functions ===
def count_emoji(s):
    return sum(1 for c in s if unicodedata.category(c) in ('So', 'Sk') or
               0x1F600 <= ord(c) <= 0x1F9FF or
               0x2600 <= ord(c) <= 0x27BF or
               0x1F300 <= ord(c) <= 0x1F5FF or
               0x1F900 <= ord(c) <= 0x1F9FF)

def get_emoji_list(s):
    return [c for c in s if unicodedata.category(c) in ('So', 'Sk') or
            0x1F600 <= ord(c) <= 0x1F9FF or
            0x2600 <= ord(c) <= 0x27BF or
            0x1F300 <= ord(c) <= 0x1F5FF or
            0x1F900 <= ord(c) <= 0x1F9FF]

def has_keigo(s):
    return any(k in s for k in ['ます', 'です', 'ください', 'ございます', 'いたします'])

def has_tameguchi(s):
    return any(k in s for k in ['だよ', 'だね', 'じゃん', 'しよ', 'だろ', 'かな', 'よね'])

# === Collect YOUR_NAME's messages ===
self_msgs = []
for e in data.get('chunk', []):
    if e.get('type') == 'm.room.message':
        sender = e.get('sender', '')
        body = e.get('content', {}).get('body', '')
        if ('YOUR_MATRIX_USER_PARTIAL' in sender or sender == '@admin:matrix.local') and body and body not in ('sticker.png', 'image.jpg', ''):
            self_msgs.append(body)

issues = []

if not self_msgs:
    print('⚠️ No past messages from YOUR_NAME. Skipping style comparison')
    print('RESULT: PASS (no baseline)')
    sys.exit(0)

# === 1. Emoji count check ===
avg_emoji = sum(count_emoji(m) for m in self_msgs) / len(self_msgs)
max_emoji = max(count_emoji(m) for m in self_msgs)
draft_emoji = count_emoji(draft)
emoji_limit = max(int(avg_emoji) + 1, 2)  # at least 2

if draft_emoji > emoji_limit:
    issues.append(f'❌ Too many emoji: draft {draft_emoji} > limit {emoji_limit} (YOUR_NAME avg {avg_emoji:.1f})')

# === 2. NG emoji check ===
ng_emoji_map = {
    '😂': 'LOL nuance. Inappropriate in apology/formal context',
    '🤣': 'ROFL. Inappropriate in business/apology context',
    '🎉': 'Overly high-tension. Tends to diverge from YOUR_NAME'\''s style',
    '✨': 'Use sparingly. More than 2 per message is excessive',
    '💕': 'Strong romantic nuance. Inappropriate for distant relationships',
    '❤️': 'Same as above',
    '🥰': 'Same as above',
    '😘': 'Same as above',
}

draft_emojis = get_emoji_list(draft)
for emoji in draft_emojis:
    if emoji in ng_emoji_map:
        # Check if YOUR_NAME actually uses this emoji in this chat
        self_uses = any(emoji in m for m in self_msgs)
        if not self_uses:
            issues.append(f'⚠️ Emoji warning: {emoji} — {ng_emoji_map[emoji]} (YOUR_NAME has not used this in this chat)')

# === 3. Message length check ===
avg_len = sum(len(m) for m in self_msgs) / len(self_msgs)
draft_len = len(draft)
if draft_len > avg_len * 2.5:
    issues.append(f'⚠️ Too long: draft {draft_len} chars > YOUR_NAME avg {avg_len:.0f} chars x 2.5')

# === 4. Tone consistency (keigo vs tameguchi) ===
self_keigo = sum(1 for m in self_msgs if has_keigo(m))
self_tame = sum(1 for m in self_msgs if has_tameguchi(m))
draft_keigo = has_keigo(draft)
draft_tame = has_tameguchi(draft)

if self_keigo > self_tame * 2 and draft_tame and not draft_keigo:
    issues.append(f'❌ Tone mismatch: YOUR_NAME is keigo-based (keigo {self_keigo} vs casual {self_tame}) but draft is casual')
elif self_tame > self_keigo * 2 and draft_keigo and not draft_tame:
    issues.append(f'❌ Tone mismatch: YOUR_NAME is casual-based (casual {self_tame} vs keigo {self_keigo}) but draft is keigo')

# === 5. Constraints check ===
rel_file = MSG_REL_FILE if 'MSG_REL_FILE' in dir() else None
import os
rel_file = os.environ.get('MSG_REL_FILE', os.path.join(os.environ.get('WORKSPACE', '.'), 'private', 'relationships.md'))
try:
    with open(rel_file, 'r') as f:
        rel_content = f.read()

    # Find the person's section
    sections = re.split(r'(?=^### )', rel_content, flags=re.MULTILINE)
    for section in sections:
        if name.lower() in section.lower():
            # Check for distance/avoidance policies
            distance_keywords = ['距離を置く', '距離を取る', '作らない', '避ける', '控える', '禁止']
            approach_keywords = ['会いたい', '楽しみ', 'ぜひ会', 'デート', '二人で', '今度いつ']

            has_distance_policy = any(k in section for k in distance_keywords)
            draft_has_approach = any(k in draft for k in approach_keywords)

            if has_distance_policy and draft_has_approach:
                issues.append(f'❌ Policy conflict: \"keep distance\" policy but draft has approach expressions')
            break
except:
    pass

# === Output ===
if not issues:
    print('✅ PASS — style and policy check OK')
    print(f'   Emoji: {draft_emoji} (limit {emoji_limit})')
    print(f'   Length: {draft_len} chars (YOUR_NAME avg {avg_len:.0f})')
    print('RESULT: PASS')
else:
    has_critical = any(i.startswith('❌') for i in issues)
    for i in issues:
        print(f'  {i}')
    if has_critical:
        print('RESULT: FAIL')
    else:
        print('RESULT: WARN')
" "$DRAFT" "$NAME"
