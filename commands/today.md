---
description: Morning briefing — fetch email, Slack, LINE, Messenger, Chatwork, and calendar in parallel, then triage action items
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

Fetch email, Slack, LINE, Messenger, Chatwork, and calendar/todo **in parallel**, triage pending responses and tasks, generate today's briefing, then process all action_required items with reply drafts through to send + follow-up.

**Goal:** Zero undecided items — every pending response, overdue task, and action_required message gets a decision before the briefing ends.

---

## Step 0: Diff-based check (token optimization)

**Don't fetch everything from scratch every time.** If autonomous triage results exist, only fetch the diff.

1. **Check for previous triage results**
   ```bash
   ls -t YOUR_WORKSPACE/logs/triage-runs/*/combined.json 2>/dev/null | head -1
   ```
   If a file exists, Read it to understand the previous action_required list.

2. **Diff fetch strategy**
   - Email: `gog gmail search "is:unread newer_than:4h ..."` — only unread since last run
   - Slack: only messages after the previous run's timestamp
   - LINE/Messenger: always fetch latest (diff tracking is impractical for bridge-based access)
   - Calendar/Todo: always fetch latest

3. **No previous results (first run of the day)** → full fetch (proceed to Step 1)

4. **Check memory/session logs** — don't re-process items that were already handled in an earlier session

---

## Step 1: Parallel data fetch

**Launch 6 Tasks simultaneously.**

### Task 1: Email fetch + classify + archive skips

Bash agent:

```bash
gog gmail search "is:unread to:me -category:promotions -category:social" --max 20 --json --account YOUR_EMAIL
gog gmail search "is:unread to:me -category:promotions -category:social" --max 20 --json --account YOUR_WORK_EMAIL
```

`to:me` filters out shared mailbox noise. See `mail.md` for the optional shared mailbox escalation check.

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

### Task 6: Chatwork fetch + classify

Bash agent:

```bash
bash YOUR_WORKSPACE/scripts/chatwork-fetch.sh --hours 24 --json
```

Classify using the "Chatwork Classification Rules" section below.

---

## Step 1.5: Cross-platform deduplication

After all Tasks return, **before** generating the briefing, detect and merge duplicate topics that span multiple platforms.

### Detection rules

Flag items as "same topic" when **any** of these match:

| Signal | Example |
|--------|---------|
| **Same person × same keywords** | Slack DM @alice "deploy review" + email alice@... "Re: Deploy review" |
| **Cross-posted link** | Email contains a Slack permalink, or Slack message quotes an email |
| **Same meeting reference** | Email with Zoom link + Slack "see you at standup" + calendar event |
| **Forward / CC expansion** | Email CC'd to team → same content pasted in Slack channel |

**Identity matching**: Use `private/relationships.md` (or equivalent contact file) to resolve the same person across platforms (e.g. Slack @alice = email alice@corp.com = LINE Alice).

### Merge rules

1. **Pick a primary platform** — where the main conversation lives (where you should reply)
   - The platform with a direct question/request → primary
   - If both have questions → the earlier one
   - If one is notification-only (CC, forward) → the other is primary

2. **Promote classification** — use the highest tier across platforms
   ```
   action_required > meeting_info > info_only > skip
   ```
   Example: email info_only + Slack action_required → action_required (reply via Slack)

3. **Cross-reference in briefing** — show merged items under the primary platform with a link to the secondary
   ```
   #### 1. Alice Chen - Deploy review
   **Slack DM** @alice: Requesting approval for production deploy
   **📎 Also**: email alice@... "Re: Deploy review" (same topic → replying via Slack)
   ```

4. **Single reply** — only draft a reply on the primary platform. Mark the secondary as "covered by [platform] reply"

### Skip dedup for

- skip × skip pairs — both get archived, no detection needed
- Same person but clearly different topics
- Messages more than 24 hours apart — treat as separate

---

## Step 2: Generate briefing

Combine all Task results (with Step 1.5 dedup applied) into this format:

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
**📎 Also**: Slack DM @alice (same topic → replying via email)

## Slack

### Mentions (N)
1. #product-dev Alice: Deploy review
2. #general Bob: Shared planning doc

### DMs (N)
1. @charlie: Timeline update?
   **📎 Also**: LINE Charlie (same scheduling thread → replying via Slack)

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

## Chatwork

### Action Required (N)
1. [RoomName] CustomerName: Question summary
2. DM @PersonName: Message summary

### Info Only (N)
1. [RoomName] PersonName: Shared content summary

## Todo (today)
- [ ] Prepare for 14:00 client meeting
- [ ] Submit expense report

## Triage Queue (preview)
- Stale/critical pending responses: N
- Overdue tasks: N
- Today's tasks: N

→ Details in Step 3.

---

Briefing complete. N action_required items (email: N, Slack: N, LINE: N, Messenger: N, Chatwork: N). N triage items pending decision in Step 3.
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

For each action_required sender, check **local files first** before searching Slack/email:

1. Search `private/relationships.md` for the sender name
2. Search `private/todo.md` for related entries
3. Search calendar (next 30 days) for existing events with the sender

If you have a context-lookup script, use it:
```bash
YOUR_WORKSPACE/scripts/context-lookup.sh "<sender_name>"
```

Only proceed to Slack/email search if local context is insufficient.

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

#### Chatwork
```bash
curl -s -X POST \
  -H "x-chatworktoken: ${CHATWORK_API_TOKEN}" \
  -d "body=<reply>&self_unread=0" \
  "https://api.chatwork.com/v2/rooms/<room_id>/messages"
```

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
cd YOUR_WORKSPACE && git add -A && git commit -m "today: morning triage (email/slack/line/messenger/chatwork replies)" && git push
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
- Shared mailbox threads (e.g. `from:support@`) — unless customer mentions you by name (see `mail.md` escalation rule)

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

---

## Chatwork Classification Rules

### skip
- Your own messages only in the time window
- System notifications (member joined/left)
- Bot/integration posts

### info_only
- Group chat messages not addressed to you (`[To:YOUR_ACCOUNT_ID]` absent)
- File shares without question

### meeting_info
- Zoom/Teams/Meet URL
- Date/time + meeting context

### action_required
- Message contains `[To:YOUR_ACCOUNT_ID]` and last message is not yours
- DM where other party sent last message
- Question/request keywords: `?`, `お願い`, `確認`, `教えて`, `いかがでしょう`, `ご対応`, `ご確認`, `ご教示`, `可能でしょうか`

### Priority: skip > meeting_info > action_required > info_only
