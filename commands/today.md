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

Fetch email, Slack, LINE, Messenger, and calendar/todo **in parallel**, generate today's briefing, triage all tasks and pending responses, then process action_required items with reply drafts through to send + follow-up.

**Goal: complete in under 10 minutes. Zero undecided items.**

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

### Task 3: Calendar + Google Tasks + Local Todo

Bash agent:

**3a. Today's calendar events:**
```bash
gog calendar events --today --max 30
```

**3b. Google Tasks due today & tomorrow (all task lists):**

First, get all task list IDs dynamically:
```bash
gog tasks lists --json
```

Then for each task list, fetch tasks due today and tomorrow:
```bash
TODAY=$(date -u +%Y-%m-%dT00:00:00Z)
DAYAFTER=$(date -u -v+2d +%Y-%m-%dT00:00:00Z)
gog tasks list "<tasklistId>" --due-min "$TODAY" --due-max "$DAYAFTER" --json
```

Also fetch overdue tasks (due before today, still not completed):
```bash
gog tasks list "<tasklistId>" --due-max "$TODAY" --json
```

**Retain `tasklistId` and `taskId` from JSON responses — needed in Step 3 for task operations.**

**3c. Local todo + Pending Response analysis:**

Read `private/todo.md` and:
- Extract today's relevant incomplete tasks from Upcoming table
- Parse the **Pending Response** table and for each row:
  - Calculate **days elapsed** from `Date Sent` (YYYY-MM-DD) to today
  - Determine **external/internal**: if `To` does NOT contain `YOUR_WORK_DOMAIN` → external
  - Classify: `critical` (>7 days) / `stale` (>3 days) / `fresh` (≤3 days)
  - If `Wait until` column exists and date has passed → reclassify as `stale` regardless of original Date Sent

**If Pending Response table is empty (no data rows), skip classification.**

### Task 4: LINE fetch + classify

Bash agent (equivalent to `/line check`):

```bash
MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-sync.sh
```

**Existing triage file check:**
```bash
ls -lt private/*line* private/drafts/*line* 2>/dev/null
```

Classify using LINE Classification Rules below.

### Task 5: Messenger fetch + classify

Bash agent (equivalent to `/messenger check`):

**Route A: Matrix API (when bridge is running)**
```bash
TOKEN="$MATRIX_ADMIN_TOKEN"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8008/_synapse/admin/v1/rooms?limit=200" | \
  python3 -c "import sys,json; [print(f'{r[\"room_id\"]} | {r.get(\"name\",\"?\")} | members:{r.get(\"joined_members\",0)}') for r in json.load(sys.stdin).get('rooms',[]) if 'meta' in str(r.get('creator','')).lower() or 'facebook' in str(r.get('name','')).lower()]"
```

→ Fetch latest messages from each room and identify unread/needs-reply.

**Route B: Chrome AppleScript (when bridge is down)**
→ See `procedures/by-domain/messenger/fb-messenger-chrome-control.proc.md`

**Existing triage file check:**
```bash
ls -lt private/*messenger* private/drafts/*messenger* 2>/dev/null
```

Classify using Messenger Classification Rules below.

---

## Step 2: Today's Briefing

Combine all 5 Task results into this **concise** format. Details are handled in subsequent steps — keep this brief.

```
# Today — YYYY-MM-DD (Day)

## Schedule (N events)

| Time        | Event           | Prep needed? |
|-------------|-----------------|--------------|
| 10:00-11:00 | Team standup     | —            |
| 14:00-15:00 | Business review  | ⚠️ non-routine |
| 16:00-16:30 | 1on1 with Alice  | —            |

## Triage Queue (N items → Step 3)
- 🔴 Stale/Critical Pending: N items
- ⚠️ Overdue Tasks: N items
- Today's Tasks: N items

## Inbox (→ Step 4)
- Email: action_required N / auto-archived N
- Slack: action_required N / skipped N
- LINE: action_required N / skipped N
- Messenger: action_required N / skipped N

### Tomorrow's Tasks (reference only)
- [ ] [List Name] Task name
```

**Prep needed? column rules:**
- Routine recurring meetings (weekly standups, regular 1on1s) → `—`
- Non-routine, first-time, or meetings with agenda/description → `⚠️ non-routine`

---

## Step 2.5: Meeting Prep Trigger

**Skip this step if all meetings show `—` (routine only).**

Present today's non-routine meetings as a numbered list:

```
## Meeting Prep

Non-routine meetings today:
1. 14:00 Business review
2. 17:00 New project kickoff

→ Select meetings that need prep (comma-separated numbers. Enter to skip)
```

For each selected meeting:
- Ask: "What do you need to prepare?" (free text, one line)
- Add as a Google Task with today's due date:
  ```bash
  gog tasks add "<tasklistId>" "<prep description>" --due "$(date +%Y-%m-%d)"
  ```

**No information generation. No agenda guessing. Only capture what the user already knows they need to do.**

---

## Step 3: Task Triage

**Process ALL items. Every item must get a decision. Zero undecided at the end.**

### 3.0 Build merged triage list

Combine into a single list with source labels:
- Google Tasks: overdue + today (from Step 1 Task 3b)
- todo.md Pending Response: stale + critical items (from Step 1 Task 3c)
- Meeting prep tasks just added in Step 2.5

Display the merged list before starting triage:
```
## Triage Queue (N items)

### Stale/Critical Pending Response (N)
| # | Days | To | Subject | Ext? | Severity |
|---|------|----|---------|------|----------|
| 1 | 🔴 9d | partner@ext.co | Contract review | Yes | critical |
| 2 | ⚠️ 4d | colleague@company.com | Design review | No | stale |

### Overdue Google Tasks (N)
| # | Task | List | Due | Overdue |
|---|------|------|-----|---------|
| 3 | Submit report | Work | 02/20 | 3d |

### Today's Google Tasks (N)
| # | Task | List |
|---|------|------|
| 4 | Hiring feedback | HR |
| 5 | Review prep | Work |
```

### 3.1 Stale Pending Response (3+ days)

Process in order: external critical → external stale → internal stale.

**If external AND >7 days (critical): [Wait] is NOT available.**

For each item, present options:

| Severity | Options |
|----------|---------|
| External critical (>7d) | [Follow up] / [Resolved] |
| All others (>3d) | [Follow up] / [Wait → deadline required] / [Resolved] |

Actions:
- **Follow up** → Add to Step 4 follow-up queue. Will generate reply draft later.
- **Wait** → Ask: "Wait until when? (YYYY-MM-DD)". Record `Wait until: <date>` in todo.md Pending Response row. When that date arrives, auto-promote to stale.
- **Resolved** → Remove row from todo.md Pending Response table.

### 3.2 Overdue Google Tasks

Judgment criteria for each item: **"Will there be real harm if I don't do this today?"**

For each item, present options:
- **[Do today]** → Update due date to today: `gog tasks update "<listId>" "<taskId>" --due "$(date +%Y-%m-%d)"`
- **[Reschedule]** → Ask date, then: `gog tasks update "<listId>" "<taskId>" --due "<YYYY-MM-DD>"`
- **[Done]** → Complete: `gog tasks done "<listId>" "<taskId>"`

### 3.3 Today's Google Tasks

For each item:
- **[OK]** → Keep as-is. Confirmed for today.
- **[Reschedule]** → Ask date, then update.
- **[Done]** → Complete.

### 3.4 Triage complete + Focus question

```
Triage complete: N/N items decided. 0 undecided.
→ M follow-up drafts to process in Step 4
```

Then ask **one question**:

```
Which of today's tasks will move the business forward the most? (select by number)
```

→ If selected item is not already in Google Tasks, add it with today's due date.
→ Display: `🎯 Today's #1: <selected action>`

This is a forcing function — choosing the most important thing implicitly deprioritizes everything else.

---

## Step 4: Process action_required + follow-ups

After triage, **continue immediately** to handle replies.

**Process two queues:**
1. Email/Slack/LINE/Messenger action_required items (from Step 1)
2. Follow-up drafts (from Step 3.1 — items where user chose [Follow up])

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

#### Email replies (new messages)
- **Signature**: YOUR_SIGNATURE
- **Tone**: Reference `SOUL.md` external communication style
- Scheduling: weekdays YOUR_WORK_HOURS only

#### Follow-up replies (from triage)
- Search for original thread: `gog gmail search` (all accounts in parallel)
- Read `private/relationships.md` for context
- Draft a follow-up that is polite but clearly requests a response
- If scheduling-related → use calendar-suggest.js

#### Slack replies
- **No signature**
- **Tone: context-dependent**
  - Internal channels/DMs → casual but respectful
  - External/business → professional
  - Friends → informal

#### LINE replies
- **Run `line-draft.sh` before writing draft**
  ```bash
  bash scripts/line-draft.sh <name>
  ```
- Read relationships.md + chat history + writing style samples before composing
- Match keigo/casual tone to your past writing style
- No unnecessary apologies
- **After draft is complete, review with `line-review.sh` (FAIL = do not send)**
  ```bash
  MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-review.sh <name> <draft text>
  ```

#### Messenger replies
- **Run `messenger-draft.sh` before writing draft**
  ```bash
  bash scripts/messenger-draft.sh <name>
  ```
- Read relationships.md + chat history + writing style samples before composing
- Messenger tends more formal than LINE (more business contacts)
- No unnecessary apologies

### 4.5 Present to user
For each action_required / follow-up message:
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
bash scripts/line-send.sh <name> <message>
```
- After sending, update status table (`private/drafts/line-replies-YYYY-MM-DD.md`)
- **Sending to group chats is prohibited** (unless user explicitly instructs)

#### Messenger
```bash
bash scripts/messenger-send.sh <name> <message>            # via Matrix
bash scripts/messenger-send.sh <name> <message> --chrome    # Chrome fallback
```
- Matrix send failure → fall back to `--chrome`
- After sending, update status table (`private/drafts/messenger-replies-YYYY-MM-DD.md`)
- **Sending to group/multi-person threads is prohibited**

---

## Step 5: Post-send processing (mandatory)

**After every send, execute ALL steps before moving to the next item.**

### 5.1 Calendar registration
Register confirmed/tentative events.

### 5.2 Update relationships.md
Add interaction history.

### 5.3 Update todo.md
Reflect schedule changes and task updates.

Additional triage-related updates:
- **Follow-up sent** → Update `Date Sent` in Pending Response to today's date
- **[Resolved] in triage** → Remove row from Pending Response table (if not already done in Step 3)
- **[Wait] with deadline** → Add/update `Wait until` column in Pending Response row

### 5.4 Git commit & push
```bash
cd YOUR_WORKSPACE && git add -A && git commit -m "today: morning triage (email/slack/line/messenger replies)" && git push
```

### 5.5 Archive processed emails
```bash
gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

### 5.6 Update LINE/Messenger triage files
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
- Official accounts (stores, brands, services):
  ```
  YOUR_LINE_SKIP_ACCOUNTS
  ```
- Sticker-only messages
- Group chat noise (no reply needed)

### info_only
- Group chat conversations (show summary only)
- Read receipts only

### action_required
- 1:1 chat where other party sent last message (`needs_reply` = true)
- Questions, confirmation of plans, scheduling, requests for reply
- **Group chats are NOT action_required** (unless user explicitly instructs)

### Priority: skip > action_required > info_only

---

## Messenger Classification Rules

### skip
- Page notifications, ads, marketplace notifications
- Sales spam (consider blocking)

### info_only
- Group chat noise
- Sticker/reaction only

### action_required
- 1:1 chat where other party sent last message
- Questions, confirmation of plans, scheduling, requests for reply
- **Group/multi-person threads are NOT action_required**

### Priority: skip > action_required > info_only
