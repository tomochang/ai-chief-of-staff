---
description: Triage unread Chatwork messages — classify, draft replies, send, and follow up
argument-hint: <triage|check>
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - AskUserQuestion
---

# /chatwork — Chatwork Triage Assistant

Arguments: $ARGUMENTS

## Overview

Classify unread Chatwork messages automatically. Skip bot noise, surface unanswered customer messages that need your attention, and draft replies.

## Mode

| Argument | Mode | Scan scope | Reply drafts |
|----------|------|------------|--------------|
| (none) or `triage` | triage | All rooms (24h) | Yes |
| `check` | check | All rooms (4h) | No (summary only) |

---

## Flow

### Step 1: Fetch messages

```bash
# triage mode (24h)
bash YOUR_WORKSPACE/scripts/chatwork-fetch.sh --json

# check mode (4h)
bash YOUR_WORKSPACE/scripts/chatwork-fetch.sh --hours 4 --json
```

The script returns JSON with:
- `my_account_id`: your Chatwork account ID
- `rooms`: array of rooms with recent activity
- Each room contains `messages` array with `is_mine`, `to_me`, `account_name`, `body`, `send_time`
- `needs_action`: true if last message is not from you AND (mentions you OR is a DM)

---

### Step 2: Classify

For each room with activity, classify into one of four categories:

| Category | Condition | Action |
|----------|-----------|--------|
| **skip** | Your own messages only, system notifications (member joined/left), bot posts | Hidden |
| **info_only** | Messages in group chats not addressed to you, file shares without question | Summary |
| **meeting_info** | Zoom/Teams/Meet URL, date+time+meeting context | Calendar cross-reference & update |
| **action_required** | `to_me` is true + last message is not yours, DM where other party sent last, question/request keywords | Draft reply |

#### skip rules

- Room has only your own messages in the time window
- System notifications (member joined/left room)
- Messages from known bot/integration accounts

#### action_required rules

- `needs_action` is true from the fetch script AND:
  - Message body contains `[To:YOUR_ACCOUNT_ID]` (addressed to you)
  - OR room_type is `direct` (1:1 DM) and last message is not yours
- Question/request keywords: `?`, `お願い`, `確認`, `教えて`, `いかがでしょう`, `ご対応`, `ご確認`, `ご教示`, `可能でしょうか`

---

### Step 2.5: meeting_info auto-processing

Same logic as `/mail`. Detect meeting info → cross-reference calendar → update if gaps found.

---

### Step 3: Process action_required

**`check` mode skips this step (summary only).**

1. **Get sender context** — Read `private/relationships.md`
2. **Detect scheduling keywords** → Check calendar availability
3. **Generate draft reply**
   - **No signature** (Chatwork messages don't use signatures)
   - **Tone: match the context**
     - Customer/business → polite and professional
     - Internal → casual but respectful
   - Reference `SOUL.md` for communication style

---

### Step 4: Present to user

#### `check` mode output

```
## Chatwork Check (last 4h)

### Action Required (N)
1. [RoomName] CustomerName: 質問内容の要約
2. DM @PersonName: メッセージの要約

### Info Only (N)
1. [RoomName] PersonName: 共有内容の要約

→ For replies, run `/chatwork triage`
```

#### `triage` mode output

```
## Chatwork Triage Results

### Skipped (N)
- System/bot messages hidden

### Info Only (N)
- [RoomName] PersonName: 共有内容

### Action Required (N)

#### 1. [RoomName] / CustomerName
**Message**: お問い合わせ内容
**Posted**: 2026-02-18 14:32
**Room type**: group / direct

**Draft reply**:
返信案のテキスト

→ [Send] [Edit] [Skip]
```

---

### Step 5: Send

On approval:

```bash
curl -s -X POST \
  -H "x-chatworktoken: ${CHATWORK_API_TOKEN}" \
  -d "body=REPLY_TEXT&self_unread=0" \
  "https://api.chatwork.com/v2/rooms/ROOM_ID/messages"
```

**Important**:
- Set `self_unread=0` so the sent message doesn't show as unread to you
- To quote the original message, use: `[引用 aid=ACCOUNT_ID mid=MESSAGE_ID] original text [/引用]`
- To mention someone, use: `[To:ACCOUNT_ID] NAME さん`

---

### Step 6: Post-send processing (mandatory)

**After sending a Chatwork reply, execute ALL of the following.**

#### 6.1 Calendar registration
Same as `/mail` — if scheduling was involved, register events.

#### 6.2 Mark as read
```bash
curl -s -X PUT \
  -H "x-chatworktoken: ${CHATWORK_API_TOKEN}" \
  -d "message_id=LAST_MESSAGE_ID" \
  "https://api.chatwork.com/v2/rooms/ROOM_ID/messages/read"
```

#### 6.3 Update relationships.md
Add interaction history to the relevant person's section.

#### 6.4 Update todo.md
Reflect schedule changes and task status updates.

#### 6.5 Git commit & push
```bash
cd YOUR_WORKSPACE && git add -A && git commit -m "chatwork: reply to PersonName re: topic" && git push
```

**Execute all steps as one unit. Do not stop midway.**

---

## Classification priority

Apply top-to-bottom. First match wins:
1. **skip** → Your own messages, system notifications, bots
2. **meeting_info** → Meeting link, date/time, location
3. **action_required** → To:me + unanswered, DM unanswered, question/request
4. **info_only** → Everything else

---

## Notes

- Chatwork API rate limit: 300 requests / 5 minutes. The fetch script handles pacing.
- Chatwork has no thread concept — messages are flat per room. "Unanswered" means the last message in the room is from someone else.
- If a room has high message volume, focus on the most recent messages addressed to you rather than reading the entire history.
- `CHATWORK_API_TOKEN` must be set as an environment variable before running.
