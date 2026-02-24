#!/bin/bash
# msg-core.sh — Messaging scripts shared functions
#
# Usage: Source at the top of each script
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/core/msg-core.sh"
#
# Provided functions:
#   msg_search_relationships  — Extract person info from relationships.md
#   msg_check_approval        — Check if approved via status file
#   msg_update_status         — Update status table entry
#   msg_show_post_send_checklist — Show post-send task checklist
#   msg_verify_matrix_response   — Extract event_id from Matrix API response
#   msg_search_matrix_room       — Search Matrix room by name
#   msg_join_matrix_room         — Join a Matrix room
#   msg_send_matrix              — Send message to Matrix room
#   msg_display_matrix_history   — Display Matrix chat history + style samples

# === Default paths (can be overridden before sourcing) ===
MSG_REL_FILE="${MSG_REL_FILE:-$WORKSPACE/private/relationships.md}"
MSG_DRAFT_DIR="${MSG_DRAFT_DIR:-$WORKSPACE/private/drafts}"

# === Common variables ===
MSG_TODAY="${MSG_TODAY:-$(TZ=Asia/Tokyo date +%Y-%m-%d)}"
MSG_NOW_JST="${MSG_NOW_JST:-$(TZ=Asia/Tokyo date '+%m/%d %H:%M')}"

# =============================================================================
# 1. relationships.md search
# Usage: msg_search_relationships <name> [rel_file]
# =============================================================================
msg_search_relationships() {
    local name="$1"
    local rel_file="${2:-$MSG_REL_FILE}"

    if [ ! -f "$rel_file" ]; then
        echo "⚠️ relationships.md not found: $rel_file"
        return 1
    fi

    python3 -c "
import re, sys
name = sys.argv[1]
with open(sys.argv[2], 'r') as f:
    content = f.read()
sections = re.split(r'(?=^### )', content, flags=re.MULTILINE)
found = False
for section in sections:
    if name.lower() in section.lower():
        print(section.strip())
        print('---')
        found = True
if not found:
    print(f'⚠️ {name} not found in relationships.md')
" "$name" "$rel_file" 2>/dev/null || echo "⚠️ relationships.md read error"
}

# =============================================================================
# 1b. Extract constraints/policies from relationships.md
# Usage: msg_extract_constraints <name> [rel_file]
# =============================================================================
msg_extract_constraints() {
    local name="$1"
    local rel_file="${2:-$MSG_REL_FILE}"

    if [ ! -f "$rel_file" ]; then
        return 0
    fi

    python3 -c "
import re, sys
name = sys.argv[1]
with open(sys.argv[2], 'r') as f:
    content = f.read()

sections = re.split(r'(?=^### )', content, flags=re.MULTILINE)
constraints = []

# Target subsection headers that contain policies/constraints
constraint_headers = [
    'YOUR_NAME の本音', 'YOUR_NAME の位置づけ', '情報管理方針',
    '方針', '注意', 'NG', '禁止', '制約',
]

for section in sections:
    if name.lower() not in section.lower():
        continue

    # Extract #### subsections that match constraint headers
    subsections = re.split(r'(?=^#### )', section, flags=re.MULTILINE)
    for sub in subsections:
        header_match = re.match(r'^#### (.+)', sub)
        if not header_match:
            continue
        header = header_match.group(1).strip()
        if any(ch in header for ch in constraint_headers):
            # Extract bullet points
            lines = sub.strip().split('\n')[1:]  # skip header
            for line in lines:
                line = line.strip()
                if line.startswith('-') or line.startswith('*'):
                    constraints.append(line)

    # Also check for inline bold warnings — only from constraint subsections
    # (Skip this for sections already captured above to avoid duplicates)

if constraints:
    print('## 5. Draft constraints (person-specific)')
    print('---')
    for c in constraints:
        # Ensure warning emoji
        if '⚠️' not in c and '❌' not in c:
            c = c.replace('- ', '- ⚠️ ', 1)
        print(c)
else:
    print('## 5. Draft constraints (person-specific)')
    print('---')
    print('  (none)')
" "$name" "$rel_file" 2>/dev/null
}

# =============================================================================
# 2. Approval check
# Usage: result=$(msg_check_approval <name> <draft_file>)
# Returns: "YES" / "NO" / "SKIP"
# =============================================================================
msg_check_approval() {
    local name="$1"
    local draft_file="$2"

    if [ ! -f "$draft_file" ]; then
        echo "SKIP"
        return 0
    fi

    python3 -c "
import re, sys
name = sys.argv[1]
with open(sys.argv[2], 'r') as f:
    content = f.read()
# Flexible: name in a table row with ✅ anywhere after it
pattern = rf'\|[^|]*{re.escape(name)}[^|]*\|.*✅'
if re.search(pattern, content, re.IGNORECASE):
    print('YES')
else:
    print('NO')
" "$name" "$draft_file" 2>/dev/null || echo "SKIP"
}

# =============================================================================
# 3. Approval check (multi-file)
# Usage: msg_require_approval <name> <file1> [file2] ...
# Exits 1 if not approved. Returns 0 if approved or no file found.
# =============================================================================
msg_require_approval() {
    local name="$1"
    shift

    for f in "$@"; do
        if [ -f "$f" ]; then
            local approved
            approved=$(msg_check_approval "$name" "$f")
            if [ "$approved" = "NO" ]; then
                echo "❌ Not approved: $name — status file does not show ✅"
                echo "Please get explicit approval from YOUR_NAME before sending"
                exit 1
            fi
            return 0
        fi
    done
    # No file found — skip check
    return 0
}

# =============================================================================
# 4. Status table update
# Usage: msg_update_status <identifier> <now_jst> <status_file>
# identifier: name, email address, or channel ID
# =============================================================================
msg_update_status() {
    local identifier="$1"
    local now_jst="$2"
    local status_file="$3"

    if [ ! -f "$status_file" ]; then
        echo "  📝 No triage file (status update skipped)"
        return 0
    fi

    python3 -c "
import re, sys
identifier = sys.argv[1]
now = sys.argv[2]
with open(sys.argv[3], 'r') as f:
    content = f.read()
lines = content.split('\n')
updated = False
for i, line in enumerate(lines):
    if identifier.lower() in line.lower() and '❌' in line:
        # Replace specific patterns first, then generic
        new_line = line.replace('❌ 未送信', '✅ 送信済み')
        if new_line == line:
            new_line = line.replace('❌', '✅')
        # Try to insert timestamp in empty trailing column
        new_line = re.sub(r'\| *\|$', f'| {now} JST |', new_line)
        lines[i] = new_line
        updated = True
        break
if updated:
    with open(sys.argv[3], 'w') as f:
        f.write('\n'.join(lines))
    print(f'  📝 Status updated ({sys.argv[3].split(\"/\")[-1]})')
else:
    print(f'  ⚠️ Could not auto-update status (please update manually)')
" "$identifier" "$now_jst" "$status_file" 2>/dev/null || echo "  ⚠️ Status update skipped"
}

# =============================================================================
# 5. Status update (multi-file — updates first file found)
# Usage: msg_update_status_any <identifier> <now_jst> <file1> [file2] ...
# =============================================================================
msg_update_status_any() {
    local identifier="$1"
    local now_jst="$2"
    shift 2

    for f in "$@"; do
        if [ -f "$f" ]; then
            msg_update_status "$identifier" "$now_jst" "$f"
            return $?
        fi
    done
    echo "  📝 No triage file (status update skipped)"
}

# =============================================================================
# 6. Post-send task checklist
# Usage: msg_show_post_send_checklist [today]
# =============================================================================
msg_show_post_send_checklist() {
    local today="${1:-$MSG_TODAY}"

    echo ""
    echo "📋 Post-send tasks (manual):"
    echo "  [ ] Calendar — register tentative event if date-related (JST)"
    echo "  [ ] relationships.md — append interaction history"
    echo "  [ ] memory/$today.md — append send record (JST)"
    echo "  [ ] Notification — report if error recovery was needed"
    echo ""
    echo "Done."
}

# =============================================================================
# 7. Matrix API response verification
# Usage: event_id=$(msg_verify_matrix_response "$response")
# Returns event_id on success, exits 1 on failure
# =============================================================================
msg_verify_matrix_response() {
    local response="$1"

    echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'event_id' in data:
        print(data['event_id'])
    elif 'errcode' in data:
        print(f'ERROR:{data[\"errcode\"]}:{data.get(\"error\",\"\")}', file=sys.stderr)
        sys.exit(1)
    else:
        print(f'ERROR:UNKNOWN:{data}', file=sys.stderr)
        sys.exit(1)
except:
    print('ERROR:PARSE_FAIL', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null
}

# =============================================================================
# 8. Matrix room search
# Usage: room_id=$(msg_search_matrix_room <name> [exclude_creator])
# exclude_creator: e.g., "linebot" to exclude LINE rooms from messenger search
# =============================================================================
msg_search_matrix_room() {
    local name="$1"
    local exclude_creator="${2:-}"
    local token="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
    local base="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

    curl -s -H "Authorization: Bearer $token" "$base/_synapse/admin/v1/rooms?limit=200" 2>/dev/null | python3 -c "
import sys, json
name = sys.argv[1]
exclude = sys.argv[2] if len(sys.argv) > 2 else ''
data = json.load(sys.stdin)
matches = []
for r in data.get('rooms', []):
    rname = r.get('name') or ''
    creator = r.get('creator') or ''
    if name.lower() in rname.lower() and r.get('joined_members', 0) >= 2:
        if exclude and exclude.lower() in creator.lower():
            continue
        matches.append((r['room_id'], rname, r.get('joined_members', 0)))

if len(matches) == 1:
    print(matches[0][0])
elif len(matches) > 1:
    # Prefer DM (fewer members) over group when name matches exactly
    # Strategy: 1) exact name match first, 2) fewest members (likely DM)
    exact = [m for m in matches if m[1].lower() == name.lower()]
    if len(exact) == 1:
        print(exact[0][0])
    elif exact:
        # Multiple exact matches — pick fewest members (DM over group)
        exact.sort(key=lambda m: m[2])
        print(exact[0][0])
    else:
        # No exact match — pick fewest members among partials
        matches.sort(key=lambda m: m[2])
        print(matches[0][0])
        print(f'  ⚠️ Multiple candidates found. Selected room with fewest members: {matches[0][1]}', file=sys.stderr)
else:
    print('ERROR:NOT_FOUND', file=sys.stderr)
    sys.exit(1)
" "$name" "$exclude_creator" 2>/dev/null
}

# =============================================================================
# 9. Matrix room join
# Usage: msg_join_matrix_room <room_id>
# =============================================================================
msg_join_matrix_room() {
    local room_id="$1"
    local token="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
    local base="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

    curl -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
        "$base/_matrix/client/v3/join/$room_id" -d '{}' 2>/dev/null > /dev/null || true
}

# =============================================================================
# 10. Matrix message send
# Usage: response=$(msg_send_matrix <room_id> <message> <prefix>)
# prefix: "line" or "messenger" (for txnid)
# =============================================================================
msg_send_matrix() {
    local room_id="$1"
    local message="$2"
    local prefix="${3:-msg}"
    local token="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
    local base="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

    local txnid="${prefix}_send_$(date +%s%N)"
    curl -s -X PUT -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
        -d "$(python3 -c "import json,sys; print(json.dumps({'msgtype':'m.text','body':sys.argv[1]}))" "$message")" \
        "$base/_matrix/client/v3/rooms/$room_id/send/m.room.message/$txnid" 2>/dev/null
}

# =============================================================================
# 11. Matrix chat history + style sample display
# Usage: msg_display_matrix_history <room_id> [limit]
# =============================================================================
msg_display_matrix_history() {
    local room_id="$1"
    local limit="${2:-20}"
    local token="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
    local base="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

    msg_join_matrix_room "$room_id"

    curl -s -H "Authorization: Bearer $token" \
        "$base/_matrix/client/v3/rooms/$room_id/messages?dir=b&limit=$limit" 2>/dev/null | python3 -c "
import sys, json, time, re, unicodedata

data = json.load(sys.stdin)
self_msgs = []
other_msgs = []

for e in reversed(data.get('chunk', [])):
    if e.get('type') == 'm.room.message':
        sender = e.get('sender', '')
        body = e.get('content', {}).get('body', '')[:200]
        ts = e.get('origin_server_ts', 0)
        jst_ts = ts / 1000 + 9 * 3600
        t = time.strftime('%m/%d %H:%M', time.gmtime(jst_ts))

        if 'YOUR_MATRIX_USER_PARTIAL' in sender or sender == '@admin:matrix.local':
            who = 'YOUR_NAME'
            self_msgs.append(body)
        elif 'bot' in sender.lower():
            continue
        else:
            who = 'other'
            other_msgs.append(body)

        print(f'{t} JST | {who} | {body}')

def analyze_style(msgs, label):
    \"\"\"Analyze writing style numerically\"\"\"
    if not msgs:
        print(f'  (no sent messages from {label})')
        return

    # filter out stickers/images
    texts = [m for m in msgs if m and m not in ('sticker.png', 'image.jpg', '')]
    if not texts:
        print(f'  (no text messages from {label})')
        return

    # emoji count
    def count_emoji(s):
        return sum(1 for c in s if unicodedata.category(c) in ('So', 'Sk') or
                   0x1F600 <= ord(c) <= 0x1F9FF or
                   0x2600 <= ord(c) <= 0x27BF or
                   0x1F300 <= ord(c) <= 0x1F5FF or
                   0x1F900 <= ord(c) <= 0x1F9FF or
                   0xFE00 <= ord(c) <= 0xFE0F or
                   0x200D == ord(c))

    emoji_counts = [count_emoji(t) for t in texts]
    avg_emoji = sum(emoji_counts) / len(texts)
    max_emoji = max(emoji_counts)

    # message length
    lengths = [len(t) for t in texts]
    avg_len = sum(lengths) / len(texts)

    # ending patterns
    endings = {'！': 0, '？': 0, '〜': 0, '笑': 0, 'w': 0, '。': 0, '…': 0}
    for t in texts:
        for pat in endings:
            if t.rstrip().endswith(pat):
                endings[pat] += 1

    # keigo vs casual
    keigo_markers = ['ます', 'です', 'ください', 'ございます', 'いたします']
    tameguchi_markers = ['だよ', 'だね', 'じゃん', 'しよ', 'だろ', 'かな', 'よね', 'ね！', 'よ！']
    keigo_count = sum(1 for t in texts for k in keigo_markers if k in t)
    tame_count = sum(1 for t in texts for k in tameguchi_markers if k in t)

    print(f'  📊 {label} style analysis (last {len(texts)} messages):')
    print(f'     Emoji: avg {avg_emoji:.1f}/msg, max {max_emoji}')
    print(f'     Length: avg {avg_len:.0f} chars')
    print(f'     Endings: ' + ', '.join(f'{k}({v})' for k, v in endings.items() if v > 0) if any(v > 0 for v in endings.values()) else '     Endings: no specific pattern')
    print(f'     Keigo {keigo_count} vs Casual {tame_count}')

    # Sample display
    print(f'  📝 Samples:')
    for msg in texts[-5:]:
        print(f'     > {msg}')

print()
print('## 3. Style analysis')
print('---')
analyze_style(self_msgs, 'YOUR_NAME')
print()
analyze_style(other_msgs, 'other')
print()
print('## 4. Draft rules (follow this analysis)')
print('---')
m_texts = [m for m in self_msgs if m and m not in ('sticker.png', 'image.jpg', '')]
if m_texts:
    def count_emoji(s):
        return sum(1 for c in s if unicodedata.category(c) in ('So', 'Sk') or 0x1F600 <= ord(c) <= 0x1F9FF or 0x2600 <= ord(c) <= 0x27BF or 0x1F300 <= ord(c) <= 0x1F5FF)
    avg_e = sum(count_emoji(t) for t in m_texts) / len(m_texts)
    avg_l = sum(len(t) for t in m_texts) / len(m_texts)
    keigo = sum(1 for t in m_texts for k in ['ます','です','ください'] if k in t)
    tame = sum(1 for t in m_texts for k in ['だよ','じゃん','ね！','よ！','かな'] if k in t)
    tone = 'keigo-based' if keigo > tame else 'casual-based' if tame > keigo else 'mixed'
    print(f'  ✅ Emoji: max {int(avg_e)}~{int(avg_e)+1} per message (do not exceed)')
    print(f'  ✅ Length: aim for {int(avg_l*0.5)}~{int(avg_l*1.5)} chars')
    print(f'  ✅ Tone: {tone}')
    print(f'  ❌ Do not use expressions that clearly differ from YOUR_NAME'\''s style')
" 2>/dev/null
}
