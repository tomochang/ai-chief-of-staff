---
description: Triage unread emails — classify, auto-archive, cross-reference calendar, draft replies
argument-hint: <triage|check|edit>
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - AskUserQuestion
---

# /mail — Email Triage Assistant

Arguments: $ARGUMENTS

## Overview

Classify unread emails automatically. Archive noise, update calendar from meeting info, and draft replies for messages that need your attention.

## Flow

### Step 0: Pre-emptive archive (optional)

If you have a high-volume label/category that clogs your inbox, archive those first to free up search quota.

```bash
# Example: archive noisy internal support emails before main search
gog gmail search "is:unread label:YOUR_NOISY_LABEL" --max 50 --json --account YOUR_WORK_EMAIL
# → For each threadId: gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

### Step 1: Fetch unread emails

**Search all accounts in parallel. Exclude skip-worthy categories at the query level.**

```bash
# Personal account
gog gmail search "is:unread to:me -category:promotions -category:social" --max 20 --json --account YOUR_EMAIL

# Work account (exclude known noise)
gog gmail search "is:unread to:me -category:promotions -category:social -label:YOUR_NOISY_LABEL" --max 20 --json --account YOUR_WORK_EMAIL
```

`to:me` filters out shared mailbox noise (support@, info@). If you use a shared mailbox, add an optional escalation search:

```bash
# Optional: catch shared mailbox threads that mention you by name
gog gmail search "is:unread from:YOUR_SHARED_MAILBOX" --max 10 --json --account YOUR_WORK_EMAIL
```

For escalation hits, fetch the full thread and promote to action_required only if the customer references your name.

**nextPageToken**: If the response includes nextPageToken, important emails may remain. Fetch the next page.

### Step 1.5: Thread context check (mandatory)

**For threads with `messageCount >= 2`, always fetch the full thread before classifying.**

```bash
gog gmail thread <threadId>
```

- Do NOT use single-message fetch — you'll miss your own replies and misclassify.
- If the thread contains a reply from you (YOUR_EMAIL / YOUR_WORK_EMAIL) and no new action from the other party → skip or archive.
- If there's a new question/request after your reply → action_required.

### Step 2: Classify

Classify each email into one of four categories:

| Category | Condition | Action |
|----------|-----------|--------|
| **skip** | noreply, bot notifications, auto-generated | Auto-archive (don't show) |
| **info_only** | CC'd, internal shares, receipts | Show summary only |
| **meeting_info** | Calendar invites, meeting links, location shares | Calendar cross-reference & update |
| **action_required** | Direct recipient, contains questions/requests | Draft reply |

### Step 2.5: meeting_info auto-processing

When meeting-related content is detected, cross-reference with calendar and fill gaps.

#### Detection keywords
```
Teams, Zoom, Meet, WebEx, conference link, join URL, invite,
location:, meeting room, building, floor,
.ics, invite.ics, calendar
```

#### Flow

1. **Extract from email**: date/time, meeting link (Teams/Zoom/Meet URL), location, title
2. **Cross-reference calendar**:
   ```bash
   gog calendar events --from <date> --to <date+1> --max 30
   ```
3. **Check & update**:
   | Calendar state | Action |
   |----------------|--------|
   | No event found | Report to user (needs attention) |
   | Event exists, no link | Add the link |
   | Event exists, no location | Add the location |
   | Event exists, all info present | Skip |
4. **Update**:
   ```bash
   gog calendar update <calendar> <eventId> \
     --location "Location" \
     --description "Meeting link: https://..."
   ```
5. **Archive** the email after successful update. Only report to user if no matching event found.

### Step 3: Process action_required only

1. **Get sender context**
   - Read `private/relationships.md` for history and context with this person

2. **Detect scheduling keywords**
   ```
   schedule, meeting, availability, free time, calendar,
   when are you, can we meet, let's set up, time slot
   ```
   → If detected: run `node YOUR_WORKSPACE/scripts/calendar-suggest.js --days 14 --prefer-start 11`

3. **Generate draft reply**
   - Signature: YOUR_SIGNATURE
   - Tone: Reference `SOUL.md` for external communication style
   - Scheduling: Weekdays only, YOUR_WORK_HOURS (e.g., 9-18)
   - If counterpart requires travel: add buffer time before/after

### Step 4: Present to user

For each action_required email:
- Original email summary (From, Subject, key points)
- Draft reply
- Options: [Send] [Edit] [Skip]

### Step 5: Send

On approval:
```bash
gog gmail send \
  --reply-to-message-id "<messageId>" \
  --to "<recipient>" \
  --body "<reply body>"
```

**Important**: Always use `--reply-to-message-id` to maintain thread continuity.

### Step 6: Post-send processing (mandatory — do not skip)

**After sending an email, execute ALL of the following before marking the task complete.**

#### 6.1 Calendar registration
```bash
# If a date was confirmed
gog calendar create YOUR_WORK_EMAIL \
  --summary "PersonName MTG (purpose)" \
  --from "YYYY-MM-DDTHH:MM:00+09:00" \
  --to "YYYY-MM-DDTHH:MM:00+09:00"
```
- If you proposed date candidates → register ALL as `[tentative]`
- When confirmed → delete unused tentative events
- If counterpart requires travel → add travel buffer events

#### 6.2 Update relationships.md
```
Add to the relevant person's section in private/relationships.md:
- MM/DD interaction summary (e.g., "2/3 accepted MTG → 2/19 15:00 confirmed")
```

#### 6.3 Update todo.md
```
Reflect in private/todo.md:
- Add to upcoming schedule table
- Update scheduling status to "done"
```

#### 6.4 Git commit & push
```bash
cd YOUR_WORKSPACE && git add -A && git commit -m "mail: reply to PersonName re: subject" && git push
```

#### 6.5 Archive processed email
```bash
gog gmail thread modify "<threadId>" --remove "INBOX,UNREAD" --force
```

**Execute all 5 steps as one unit. Do not stop midway.**

---

## Classification Rules (detailed)

### skip (auto-archive)

- From contains `noreply`, `no-reply`, `notification`, `alert`
- From contains `@github.com`, `@slack.com`, `@jira`, `@notion.so`
- Subject contains `[GitHub]`, `[Slack]`, `[Jira]`
- YOUR_CUSTOM_SKIP_RULES (add your own patterns here)
- Shared mailbox threads (e.g. `from:support@`) — unless the customer references you by name (fetch full thread to check for your name, common misspellings, or contextual references like "your account manager")

### info_only

- You are in CC (not direct recipient)
- Subject contains `receipt`, `invoice`
- Support auto-replies to your own inquiry

### meeting_info

- Contains meeting link (Teams/Zoom/Meet URL)
- Contains date/time + meeting context
- Location or room share

### action_required

- None of the above match
- AND you are a direct recipient (in To:)
- OR contains question markers (`?`, `please confirm`, `let me know`)

### Priority order

Apply top-to-bottom. First match wins:
1. **skip** → noreply, bot, auto-generated
2. **meeting_info** → meeting link, date/time, location
3. **action_required** → direct recipient, question, request
4. **info_only** → everything else

---

## Output Format

```
## Email Triage Results

### Skipped (3) → auto-archived
- noreply@service.com - Your order has shipped
- GitHub <notifications@github.com> - [repo] PR merged
- Slack <no-reply@slack.com> - New message in #general

### Info Only (2)
- Anthropic <invoice@...> - Your receipt #2718-8582
- Support Team - Re: Your inquiry about billing

### Action Required (1)

#### 1. Jane Smith <jane@example.com>
**Subject**: Q2 project timeline
**Received**: 2026-02-18 09:15
**Summary**: Asking when we can schedule the kickoff meeting

**Draft reply**:
Hi Jane,

Thanks for reaching out. Here are some times that work for me:
...

YOUR_SIGNATURE

→ [Send] [Edit] [Skip]
```
