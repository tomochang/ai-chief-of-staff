#!/bin/bash
# line-sync.sh — LINE new message fetch + sender classification + unreplied detection
# Usage: line-sync.sh [--since HOURS] [--json]
#
# Output: Latest state per room (room name, type, last message, needs_reply)
# --json: JSON output (for use by other scripts)
# --since: Show last N hours (default: 48)

set -euo pipefail

# === Configuration ===
TOKEN="${MATRIX_ADMIN_TOKEN:?MATRIX_ADMIN_TOKEN is required}"
BASE="${MATRIX_BASE_URL:-http://127.0.0.1:8008}"

# Your sender ID (everything else is "other")
SELF_SENDERS='["@admin:matrix.local"]'
SELF_PARTIAL='["YOUR_MATRIX_USER_PARTIAL"]'

# Official accounts (skip targets)
SKIP_ROOMS='["CHANEL BEAUTY","EDIFICE","Ralph Lauren","LINEマイカード","ニューバランス","SMART GOLF","TIME SHARING","ブラック会員専用コンシェルジュ","BEE8 渋谷","C.STAND","にくだらけ","シーシャと自家製チャイ","Starbucks","お薬なび","BoConcept","Polysection","TRIBE"]'

# === Argument parsing ===
SINCE_HOURS=48
OUTPUT_JSON=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --since) SINCE_HOURS="$2"; shift 2 ;;
        --json) OUTPUT_JSON=true; shift ;;
        *) shift ;;
    esac
done

# === Sync fetch + classification ===
curl -s "${BASE}/_matrix/client/v3/sync?timeout=0&filter=%7B%22room%22:%7B%22timeline%22:%7B%22limit%22:15%7D%7D%7D" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "
import json, sys
from datetime import datetime, timezone, timedelta

data = json.load(sys.stdin)
jst = timezone(timedelta(hours=9))
now = datetime.now(tz=jst)
since_hours = int(sys.argv[1])
output_json = sys.argv[2] == 'true'
cutoff = now - timedelta(hours=since_hours)

self_senders = set($SELF_SENDERS)
self_partial = $SELF_PARTIAL
skip_rooms = [s.lower() for s in $SKIP_ROOMS]

rooms = data.get('rooms', {}).get('join', {})
results = []

for rid, rdata in rooms.items():
    # room name from state
    rname = ''
    members = set()
    for e in rdata.get('state', {}).get('events', []):
        if e.get('type') == 'm.room.name':
            rname = e.get('content', {}).get('name', '')
        if e.get('type') == 'm.room.member' and e.get('content', {}).get('membership') == 'join':
            members.add(e['state_key'])

    if not rname:
        continue

    # skip official accounts
    if any(s in rname.lower() for s in skip_rooms):
        continue

    # collect messages
    events = rdata.get('timeline', {}).get('events', [])
    msgs = []
    for e in events:
        if e.get('type') != 'm.room.message':
            continue
        sender = e.get('sender', '')
        ts = datetime.fromtimestamp(e['origin_server_ts'] / 1000, tz=jst)
        body = e.get('content', {}).get('body', '')

        # sender classification
        is_self = sender in self_senders or any(p in sender for p in self_partial)

        msgs.append({
            'ts': ts,
            'ts_str': ts.strftime('%m/%d %H:%M'),
            'sender': 'self' if is_self else 'other',
            'sender_raw': sender,
            'body': body[:200],
        })

    if not msgs:
        continue

    msgs.sort(key=lambda m: m['ts'])
    latest = msgs[-1]

    # skip if latest message is older than cutoff
    if latest['ts'] < cutoff:
        continue

    # room type: count unique non-self LINE senders
    other_senders = set(m['sender_raw'] for m in msgs if m['sender'] == 'other')
    # Also check member count from state
    non_bot_members = [m for m in members if 'bot' not in m.lower() and m != '@admin:matrix.local']
    is_group = len(other_senders) > 1 or len(non_bot_members) > 2

    # needs_reply: last message from other, and it's a question/request (not just reaction)
    needs_reply = latest['sender'] == 'other'

    results.append({
        'room_id': rid,
        'room_name': rname,
        'type': 'group' if is_group else 'dm',
        'latest_ts': latest['ts_str'],
        'latest_sender': latest['sender'],
        'latest_body': latest['body'][:100],
        'needs_reply': needs_reply,
        'messages': msgs,
    })

results.sort(key=lambda r: r['messages'][-1]['ts'], reverse=True)

if output_json:
    out = []
    for r in results:
        out.append({
            'room_id': r['room_id'],
            'room_name': r['room_name'],
            'type': r['type'],
            'latest_ts': r['latest_ts'],
            'latest_sender': r['latest_sender'],
            'latest_body': r['latest_body'],
            'needs_reply': r['needs_reply'],
        })
    print(json.dumps(out, ensure_ascii=False, indent=2))
else:
    # Human-readable output
    need_action = [r for r in results if r['needs_reply'] and r['type'] == 'dm']
    info_only = [r for r in results if not r['needs_reply'] or r['type'] == 'group']

    if need_action:
        print('🔴 Needs reply:')
        for r in need_action:
            print(f\"  {r['room_name']:20s} | {r['latest_ts']} | {r['latest_body'][:60]}\")
        print()

    if info_only:
        print('ℹ️  Acknowledged/Group:')
        for r in info_only:
            tag = '👥' if r['type'] == 'group' else '✅'
            print(f\"  {tag} {r['room_name']:20s} | {r['latest_ts']} | {r['latest_body'][:60]}\")
        print()

    # Detail: conversations for needs_reply rooms
    if need_action:
        print('--- Conversation details (needs reply only) ---')
        for r in need_action:
            print(f\"\n=== {r['room_name']} ===\")
            for m in r['messages']:
                tag = '👤YOUR_NAME' if m['sender'] == 'self' else '📨other'
                print(f\"  {m['ts_str']} {tag:8s} | {m['body'][:120]}\")
" "$SINCE_HOURS" "$OUTPUT_JSON"
