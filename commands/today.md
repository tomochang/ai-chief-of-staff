---
description: Morning briefing — fetch email, Slack, LINE, Messenger, and calendar in parallel, then triage action items
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

Fetch email, Slack, LINE, Messenger, and calendar/todo **in parallel**, triage pending responses and tasks, generate today's briefing, then process all action_required items with reply drafts through to send + follow-up.

**Goal:** Zero undecided items — every pending response, overdue task, and action_required message gets a decision before the briefing ends.

---

## Step 1: Parallel data fetch

**Launch 5 Tasks simultaneously.**

### Task 1: Email fetch + classify + archive skips

Bash agent:

```bash
gog gmail search "is:unread to:me -category:promotions -category:social" --max 20 --json --account YOUR_EMAIL
gog gmail search "is:unread to:me -category:promotions -category:social" --max 20 --json --account YOUR_WORK_EMAIL
```

The `to:me` filter ensures only emails directly addressed to you are fetched — shared mailbox or support-routed threads won't appear unless you are a direct recipient.

**Escalation check (optional):** If you use a shared mailbox (e.g. support@), add a second search to catch threads where a customer mentions you by name — even though you're not a direct recipient:

```bash
# Shared mailbox escalation check (customize from: to your shared address)
gog gmail search "is:unread from:YOUR_SHARED_MAILBOX" --max 10 --json --account YOUR_WORK_EMAIL
```

For each result, fetch the full thread (`gog gmail thread <threadId>`) and check if the customer's message body references your name (including common misspellings/variations). Only promote to action_required if your name appears in context; skip all others.

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

### Task 3: Calendar + Todo + Pending Responses

Bash agent:

#### 3a: Calendar events

```bash
gog calendar events --today --max 30
```

#### 3b: Google Tasks (conditional)

```bash
YOUR_TASK_LIST_COMMAND --due-before tomorrow --include-overdue 2>/dev/null
```

If `YOUR_TASK_LIST_COMMAND` is not configured or the command fails, **skip gracefully** — the triage step will work with todo.md alone. When available, fetch:
- Overdue tasks (due before today)
- Today's tasks
- Tomorrow's tasks (for advance planning)

#### 3c: Pending Response analysis

Read `private/todo.md` and extract:
1. **Today's relevant incomplete tasks** (as before)
2. **Pending Response table** — for each row, calculate days elapsed since `Date Sent`:
   - **Critical** (>7 days, external): No `[Wait]` tag — likely dropped or lost
   - **Stale** (>3 days): May need a nudge
   - **Fresh** (≤3 days): Normal wait period

Classify external vs internal using `YOUR_WORK_DOMAIN` — emails outside your work domain are external.

### Task 4: LINE fetch + classify

Bash agent (equivalent to `/line check`):

Fetch new messages via your LINE bridge (e.g. Matrix mautrix-line, or another integration):

```bash
# Example: Matrix bridge approach
YOUR_LINE_SYNC_COMMAND
```

**Check for existing triage files:**
```bash
ls -lt private/*line* private/drafts/*line* 2>/dev/null
```

Classify using LINE Classification Rules below.

### Task 5: Messenger fetch + classify

Bash agent (equivalent to `/messenger check`):

**Route A: Matrix bridge (when running)**
```bash
# Example: List Messenger rooms via Matrix Synapse admin API
TOKEN="$YOUR_MATRIX_ADMIN_TOKEN"
curl -s -H "Authorization: Bearer $TOKEN" \
  "YOUR_MATRIX_SERVER/_synapse/admin/v1/rooms?limit=200"
# Filter for rooms created by your Meta/Messenger bridge
```

→ Fetch latest messages from each room and determine which need replies.

**Route B: Browser automation (fallback when bridge is down)**
→ See your Messenger browser-control procedure for details.

**Check for existing triage files:**
```bash
ls -lt private/*messenger* private/drafts/*messenger* 2>/dev/null
```

Classify using Messenger Classification Rules below.

---

## Step 2: Generate briefing

Combine all 5 Task results into this format:

```
# Today's Briefing — YYYY-MM-DD (Day)

## Schedule (N)

| Time        | Event           | Location/Link     | Prep needed? |
|-------------|-----------------|-------------------|--------------|
| 09:00-10:00 | Team standup    | Zoom: https://... | —            |
| 14:00-15:00 | Client meeting  | Office Building   | ⚠️           |
| 19:00-      | Dinner @Ebisu   | Restaurant Name   | —            |

> For each ⚠️: ask user "What do you need to prepare for [event]?" — add their answer as a task.

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

## LINE

### Skipped (N)
- Official account — campaign notification
- Store — point balance

### Info Only (N)
- Group "XX" — chat summary

### Action Required (N)
#### 1. Taro Tanaka
**Last message**: Are you free this weekend?
**Context**: Friend, last met 2/10

## Messenger

### Skipped (N)
- Page notifications, marketplace

### Info Only (N)
- Group "XX" — chat summary

### Action Required (N)
#### 1. John Smith
**Last message**: Are you free next week?
**Context**: Business, last met 1/28

## Todo (today)
- [ ] Prepare for 14:00 client meeting
- [ ] Submit expense report

## Triage Queue (preview)
- Stale/critical pending responses: N
- Overdue tasks: N
- Today's tasks: N

→ Details in Step 3.

---

Briefing complete. N action_required items (email: N, Slack: N, LINE: N, Messenger: N). N triage items pending decision in Step 3.
```

---

## Step 3: Task Triage

After outputting the briefing, triage all pending items before processing replies. **Zero undecided items.**

### 3.0 Build merged triage list

Combine all sources into a single list:
- Google Tasks overdue + today (if available from Task 3b)
- Pending Response stale + critical (from Task 3c)
- Meeting prep tasks (from ⚠️ items in Schedule)

### 3.1 Stale Pending Responses (>3 days)

For each stale/critical pending response, present options:

**External critical (>7 days, no `[Wait]` tag):**
- `[Follow up]` — draft a follow-up email/message (queued for Step 4)
- `[Resolved]` — remove from Pending Response table

**All other stale (>3 days):**
- `[Follow up]` — draft a follow-up
- `[Wait → YYYY-MM-DD]` — set explicit wait-until date
- `[Resolved]` — remove from table

### 3.2 Overdue tasks

Google Tasks overdue (if available), otherwise overdue items from todo.md:
- `[Do today]` — keep on today's list
- `[Reschedule → YYYY-MM-DD]` — move to new date
- `[Done]` — mark complete

### 3.3 Today's tasks

Review today's task list for feasibility:
- `[OK]` — confirmed for today
- `[Reschedule → YYYY-MM-DD]` — move to new date
- `[Done]` — already complete

### 3.4 Triage complete

```
N/N items decided. 0 undecided. M follow-up drafts queued for Step 4.
```

---

## Step 4: Process action_required + follow-ups

After triage, **continue immediately** to handle replies and follow-ups.

### 4.1 Get sender context
Read `private/relationships.md` for each sender

### 4.2 Detect scheduling keywords
```
schedule, meeting, availability, free time, calendar,
when are you, can we meet, let's set up, time slot
```
→ If detected: `node YOUR_WORKSPACE/scripts/calendar-suggest.js --days 14 --prefer-start 11`

### 4.3 meeting_info auto-processing
Same as `/mail` — detect meeting info → calendar cross-reference → update gaps

### 4.4 Generate reply drafts

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

#### LINE replies
- **Run your draft-context script before writing** (e.g. `line-draft.sh <name>`)
- Read relationships.md + chat history + user's writing style samples before composing
- Match the user's past tone (formal/casual) for each contact
- No unnecessary apologies
- **Review draft before sending** (e.g. `line-review.sh <name> <draft>`) — block send on FAIL

#### Messenger replies
- **Run your draft-context script before writing** (e.g. `messenger-draft.sh <name>`)
- Read relationships.md + chat history + user's writing style samples before composing
- Messenger tends to be more formal than LINE (more business contacts)
- No unnecessary apologies

#### Follow-up replies (from Step 3 triage)

Process all `[Follow up]` items queued during triage:
- For each pending response marked `[Follow up]`, draft a follow-up message using the original channel (email, Slack, LINE, or Messenger)
- Tone: polite nudge, reference the original request/date
- Present to user with the same [Send] [Edit] [Skip] flow as action_required items

### 4.5 Present to user
For each action_required message:
- Original message summary
- Draft reply
- Options: [Send] [Edit] [Skip]

### 4.6 Send

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

#### LINE
```bash
YOUR_LINE_SEND_COMMAND <name> <message>
```
- Update triage/status table (`private/drafts/line-replies-YYYY-MM-DD.md`) after send
- **No group chat sends** unless the user explicitly instructs it

#### Messenger
```bash
YOUR_MESSENGER_SEND_COMMAND <name> <message>           # Primary route
YOUR_MESSENGER_SEND_COMMAND <name> <message> --chrome   # Browser fallback
```
- Primary send failure → fall back to browser automation
- Update triage/status table (`private/drafts/messenger-replies-YYYY-MM-DD.md`) after send
- **No group/multi-person thread sends**

---

## Step 5: Post-send processing (mandatory)

**After every send, execute ALL steps before moving to the next item.**

### 5.1 Calendar registration
Register confirmed/tentative events.

### 5.2 Update relationships.md
Add interaction history.

### 5.3 Update todo.md
Reflect schedule changes and task updates.

### 5.4 Update Pending Response table
Apply triage decisions from Step 3:
- `[Follow up]` sent → update `Date Sent` to today
- `[Resolved]` → remove the row
- `[Wait → YYYY-MM-DD]` → set `Wait until` date on the row

### 5.5 Git commit & push
```bash
cd YOUR_WORKSPACE && git add -A && git commit -m "today: morning triage (email/slack/line/messenger replies)" && git push
```

### 5.6 Archive processed emails
```bash
gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

### 5.7 Update LINE/Messenger triage files
Mark processed items as completed in:
- `private/drafts/line-replies-YYYY-MM-DD.md`
- `private/drafts/messenger-replies-YYYY-MM-DD.md`

**All steps as one unit. Do not stop midway.**

---

## Email Classification Rules

### skip (auto-archive)
- From contains `noreply`, `no-reply`, `notification`, `alert`
- From contains `@github.com`, `@slack.com`, `@jira`, `@notion.so`
- Subject contains `[GitHub]`, `[Slack]`, `[Jira]`
- YOUR_CUSTOM_SKIP_RULES
- Shared mailbox threads (e.g. `from:support@`) — **UNLESS** the escalation rule below applies

### Escalation rule for shared mailbox threads

Threads from shared mailboxes (e.g. support@, info@) are normally skipped, but **promote to action_required** if the customer's message body references you by name. Check for:
- Your name and common misspellings/variations (e.g. kanji variants, phonetic spellings)
- Contextual references like "your sales rep" or "the person I spoke with" that clearly refer to you

Use the full thread context to judge — a customer saying "I was told by [your name]" or "my account manager [your name]" should be flagged.

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

---

## LINE Classification Rules

### skip
- Official/brand accounts (stores, services, marketing):
  ```
  YOUR_LINE_SKIP_ACCOUNTS
  ```
- Sticker-only messages
- Group chat noise (no reply expected)

### info_only
- Group chat conversations (show summary only)
- Read receipts only

### action_required
- 1-on-1 chat where the other person sent the last message (`needs_reply` = true)
- Questions, confirmations, scheduling requests, messages expecting a response
- **Group chats are never action_required** unless the user explicitly instructs otherwise

### Priority: skip > action_required > info_only

---

## Messenger Classification Rules

### skip
- Page notifications, ads, marketplace notifications
- Sales spam (consider blocking)

### info_only
- Group conversations
- Sticker/reaction only

### action_required
- 1-on-1 chat where the other person sent the last message
- Questions, confirmations, scheduling requests, messages expecting a response
- **Group/multi-person threads are never action_required**

### Priority: skip > action_required > info_only
