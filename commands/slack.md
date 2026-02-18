---
description: Triage unread Slack messages — classify, draft replies, send, and follow up
argument-hint: <triage|check|#channel-name>
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - AskUserQuestion
  - mcp__slack__channels_list
  - mcp__slack__conversations_history
  - mcp__slack__conversations_replies
  - mcp__slack__conversations_search_messages
  - mcp__slack__conversations_add_message
---

# /slack — Slack Triage Assistant

Arguments: $ARGUMENTS

## Overview

Classify unread Slack messages automatically. Skip bot noise, surface what needs your attention, and draft replies.

## Mode

| Argument | Mode | Scan scope | Reply drafts |
|----------|------|------------|--------------|
| (none) or `triage` | triage | All channels + DMs (24h) | Yes |
| `check` | check | Mentions + DMs only (4h) | No (summary only) |
| `#channel-name` | channel | Specified channel only (24h) | Yes |

---

## Flow

### Step 1: Fetch messages

#### Phase A: Priority scan (all modes)

1. **Mentions search**
   ```
   conversations_search_messages:
     search_query: "YOUR_NAME"
     filter_date_during: "Today"
     limit: 50
   ```

2. **DMs & group DMs**
   ```
   channels_list(channel_types: "im,mpim")
   → For each: conversations_history(limit: "1d")
   ```
   - `check` mode: use `limit: "4h"` instead

#### Phase B: Channel sweep (`triage` / `#channel` mode only)

3. **Channel list**
   - `triage`: `channels_list(channel_types: "public_channel,private_channel", sort: "popularity")`
   - `#channel`: specified channel only

4. **Channel history**
   ```
   conversations_history(channel_id: <id>, limit: "1d")
   ```

#### Thread completion (all modes)

- Messages with `thread_ts` → fetch full thread via `conversations_replies` before classifying
- Without thread context, classification will be inaccurate

---

### Step 2: Classify

| Category | Condition | Action |
|----------|-----------|--------|
| **skip** | Bot/App posts, channel_join/leave, your own posts, threads you've already replied to, reminders | Hidden |
| **info_only** | Channel posts without mention, @channel/@here announcements, file shares | Summary |
| **meeting_info** | Zoom/Teams/Meet URL, date+time+meeting context, room/location share | Calendar cross-reference & update |
| **action_required** | DM (other party sent last), direct @YOUR_NAME mention, thread you participated in + unanswered, question/request keywords | Draft reply |

#### skip rules

- `subtype` is `bot_message`, `channel_join`, `channel_leave`, `channel_topic`, `channel_purpose`, `reminder_add`
- `bot_id` exists (Bot/App post)
- Your own post (user is your ID)
- Thread where you are the last reply

#### action_required rules

- DM/MPIM where the other party sent the last message
- Direct `@YOUR_NAME` mention
- Thread you've participated in (posted before) with unanswered messages after yours
- Question/request keywords: `?`, `please`, `can you`, `thoughts?`, `help`, `review`, `approve`

---

### Step 2.5: meeting_info auto-processing

Same logic as `/mail`. Detect meeting info → cross-reference calendar → update if gaps found.

---

### Step 3: Process action_required

**`check` mode skips this step (summary only).**

1. **Get sender context** — Read `private/relationships.md`
2. **Detect scheduling keywords** → Check calendar availability
3. **Generate draft reply**
   - **No signature** (Slack messages don't use signatures)
   - **Tone: match the context**
     - Internal channels/DMs → casual but respectful
     - External/business → professional
     - Friends/casual DMs → informal (emoji OK)

---

### Step 4: Present to user

#### `check` mode output

```
## Slack Check (last 4h)

### Mentions (2)
- #product-dev @YOUR_NAME from Alice: Deploy review needed
- #general @YOUR_NAME from Bob: Shared Q2 planning doc

### DMs (1)
- @charlie: Hey, any updates on the timeline?

→ For replies, run `/slack triage`
```

#### `triage` / `#channel` mode output

```
## Slack Triage Results

### Skipped (12)
- Bot/notification posts hidden

### Info Only (5)
- #announcements HR: All-hands on 2/20 at 14:00
- #random Alice: Anyone up for lunch?

### Meeting Info (1)
- #product-dev Bob: Tomorrow's MTG Zoom link → calendar updated

### Action Required (2)

#### 1. #product-dev / Alice Chen
**Message**: @YOUR_NAME can you review the staging deploy? Tests look good on my end.
**Thread**: 5 replies (last: Alice, 30min ago)
**Posted**: 2026-02-18 14:32

**Draft reply**:
Checked staging — looks good. Ship it.

→ [Send] [Edit] [Skip]

#### 2. DM / @charlie
**Message**: Any updates on the timeline?
**Posted**: 2026-02-18 15:10

**Draft reply**:
Should be done by Friday. I'll share the doc then.

→ [Send] [Edit] [Skip]
```

---

### Step 5: Send

On approval:

```
mcp__slack__conversations_add_message:
  channel_id: <channel_id>
  thread_ts: <thread_ts>  ← required for thread replies
  payload: "<reply text>"
```

**Important**:
- Thread replies MUST include `thread_ts`
- New channel posts: omit `thread_ts`

---

### Step 6: Post-send processing (mandatory)

**After sending a Slack reply, execute ALL of the following.**

#### 6.1 Calendar registration
Same as `/mail` — if scheduling was involved, register events.

#### 6.2 Update relationships.md
Add interaction history to the relevant person's section.

#### 6.3 Update todo.md
Reflect schedule changes and task status updates.

#### 6.4 Git commit & push
```bash
cd YOUR_WORKSPACE && git add -A && git commit -m "slack: reply to PersonName re: topic" && git push
```

**Execute all steps as one unit. Do not stop midway.**
(No email archive step — Slack doesn't have an archive-per-message concept.)

---

## Classification priority

Apply top-to-bottom. First match wins:
1. **skip** → Bot/App, your own posts, join/leave, reminders
2. **meeting_info** → meeting link, date/time, location
3. **action_required** → unanswered DM, direct mention, unanswered thread, question/request
4. **info_only** → everything else

---

## Notes

- If message volume is high, show Phase A results first while Phase B processes in parallel
- Watch for rate limits — fetch channel histories sequentially, retry on error
- Don't double-count messages from the same thread (count per-thread, not per-message)
- `check` mode is for quick situational awareness. No reply drafts generated
