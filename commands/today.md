---
description: Morning briefing — fetch email, Slack, and calendar in parallel, then triage action items
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - Task
  - AskUserQuestion
  - mcp__slack__channels_list
  - mcp__slack__conversations_history
  - mcp__slack__conversations_replies
  - mcp__slack__conversations_search_messages
  - mcp__slack__conversations_add_message
---

# /today — Morning Briefing & Triage

## Overview

Fetch email, Slack, and calendar/todo **in parallel**, generate today's briefing, then process all action_required items with reply drafts through to send + follow-up.

---

## Step 1: Parallel data fetch

**Launch 3 Tasks simultaneously.**

### Task 1: Email fetch + classify + archive skips

Bash agent:

```bash
gog gmail search "is:unread -category:promotions -category:social" --max 20 --json --account YOUR_EMAIL
gog gmail search "is:unread -category:promotions -category:social" --max 20 --json --account YOUR_WORK_EMAIL
```

Classify using the rules from the "Email Classification Rules" section below. Auto-archive all `skip` emails:
```bash
gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

### Task 2: Slack fetch + classify

Using Slack MCP tools (equivalent to `/slack check`):

1. **Mentions search**
   ```
   conversations_search_messages:
     search_query: "YOUR_NAME"
     filter_date_during: "Today"
     limit: 50
   ```

2. **DM + MPIM fetch**
   ```
   channels_list(channel_types: "im,mpim")
   → Each channel: conversations_history(limit: "4h")
   ```

3. **Thread completion** — messages with `thread_ts` → `conversations_replies` to get full context

Classify using the "Slack Classification Rules" section below.

### Task 3: Calendar + Todo

Bash agent:

```bash
gog calendar events --today --all --max 30
```

Also read `private/todo.md` and extract today's relevant incomplete tasks.

---

## Step 2: Generate briefing

Combine all 3 Task results into this format:

```
# Today's Briefing — YYYY-MM-DD (Day)

## Schedule (N)

| Time        | Event           | Location/Link     |
|-------------|-----------------|-------------------|
| 09:00-10:00 | Team standup    | Zoom: https://... |
| 14:00-15:00 | Client meeting  | Office Building   |
| 19:00-      | Dinner @Ebisu   | Restaurant Name   |

## Email

### Skipped (N) → auto-archived
- noreply@... - shipping notification
- GitHub - PR merged

### Info Only (N)
- Anthropic - Receipt #2718
- Support - Re: billing inquiry

### Meeting Info (N)
- Bob - Zoom link → calendar updated

### Action Required (N)
#### 1. Jane Smith <jane@example.com>
**Subject**: Q2 timeline
**Summary**: Asking about kickoff date

#### 2. Alice Chen - Agenda review
**Summary**: Needs input before Friday

## Slack

### Mentions (N)
1. #product-dev Alice: Deploy review
2. #general Bob: Shared planning doc

### DMs (N)
1. @charlie: Timeline update?

## Todo (today)
- [ ] Prepare for 14:00 client meeting
- [ ] Submit expense report

---

Briefing complete. Processing N action_required emails + N Slack messages.
```

---

## Step 3: Process action_required

After outputting the briefing, **continue immediately** to handle replies.

### 3.1 Get sender context
Read `private/relationships.md` for each sender

### 3.2 Detect scheduling keywords
```
schedule, meeting, availability, free time, calendar,
when are you, can we meet, let's set up, time slot
```
→ If detected: `node YOUR_WORKSPACE/scripts/calendar-suggest.js --days 14 --prefer-start 11`

### 3.3 meeting_info auto-processing
Same as `/mail` — detect meeting info → calendar cross-reference → update gaps

### 3.4 Generate reply drafts

#### Email replies
- **Signature**: YOUR_SIGNATURE
- **Tone**: Reference `SOUL.md` external communication style
- Scheduling: weekdays YOUR_WORK_HOURS only

#### Slack replies
- **No signature**
- **Tone: context-dependent**
  - Internal channels/DMs → casual but respectful
  - External/business → professional
  - Friends → informal

### 3.5 Present to user
For each action_required message:
- Original message summary
- Draft reply
- Options: [Send] [Edit] [Skip]

### 3.6 Send

#### Email
```bash
gog gmail send \
  --reply-to-message-id "<messageId>" \
  --to "<recipient>" \
  --body "<reply>"
```

**Pre-send checklist (mandatory):**
1. Check thread CC composition — verify reply-all is appropriate
2. For handoff/introduction threads — don't drop anyone from CC
3. Confirm To/CC with user before sending

#### Slack
```
mcp__slack__conversations_add_message:
  channel_id: <channel_id>
  thread_ts: <thread_ts>
  payload: "<reply>"
```

---

## Step 4: Post-send processing (mandatory)

**After every send, execute ALL steps before moving to the next item.**

### 4.1 Calendar registration
Register confirmed/tentative events.

### 4.2 Update relationships.md
Add interaction history.

### 4.3 Update todo.md
Reflect schedule changes and task updates.

### 4.4 Git commit & push
```bash
cd YOUR_WORKSPACE && git add -A && git commit -m "today: morning triage (email/slack replies)" && git push
```

### 4.5 Archive processed emails
```bash
gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

**All 5 steps as one unit. Do not stop midway.**

---

## Email Classification Rules

### skip (auto-archive)
- From contains `noreply`, `no-reply`, `notification`, `alert`
- From contains `@github.com`, `@slack.com`, `@jira`, `@notion.so`
- Subject contains `[GitHub]`, `[Slack]`, `[Jira]`
- YOUR_CUSTOM_SKIP_RULES

### info_only
- You are in CC
- Subject contains `receipt`, `invoice`

### meeting_info
- Contains meeting link (Teams/Zoom/Meet)
- Date/time + meeting context
- Location/room share

### action_required
- Direct recipient + question/request

### Priority: skip > meeting_info > action_required > info_only

---

## Slack Classification Rules

### skip
- Bot/App posts (`bot_id` exists, `subtype` is `bot_message`)
- Your own posts
- `channel_join`, `channel_leave`, `channel_topic`, `reminder_add`

### info_only
- Channel posts without @mention
- @channel/@here announcements
- File shares only

### meeting_info
- Zoom/Teams/Meet URL
- Date/time + meeting context

### action_required
- DM where other party sent last message
- Direct @YOUR_NAME mention
- Thread you participated in + unanswered
- Question/request keywords

### Priority: skip > meeting_info > action_required > info_only
