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

Fetch email, Slack, LINE, Messenger, and calendar/todo **in parallel**, generate today's briefing, then process all action_required items with reply drafts through to send + follow-up.

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

### Task 3: Calendar + Todo

Bash agent:

```bash
gog calendar events --today --max 30
```

Also read `private/todo.md` and extract today's relevant incomplete tasks.

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

---

Briefing complete. Processing N action_required items (email: N, Slack: N, LINE: N, Messenger: N).
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
cd YOUR_WORKSPACE && git add -A && git commit -m "today: morning triage (email/slack/line/messenger replies)" && git push
```

### 4.5 Archive processed emails
```bash
gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

### 4.6 Update LINE/Messenger triage files
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
