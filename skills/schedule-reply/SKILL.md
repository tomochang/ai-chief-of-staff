---
name: schedule-reply
description: Draft and send a scheduling reply with calendar-aware time suggestions
---

# Scheduling Reply Workflow

Create a scheduling reply, send it, and handle all follow-up in one flow.

**Message context:** $ARGUMENTS

---

## Phase 1: Information Gathering (mandatory before drafting — never skip)

**Drafting a reply without checking the calendar is strictly forbidden.**

1. **Get contact info**: Search `private/relationships.md` for the sender — check relationship, context, preferences
2. **Find free time**: Run:

   ```bash
   node YOUR_WORKSPACE/scripts/calendar-suggest.js --days 14 --prefer-start 11
   ```

   - For contacts that require travel: add `--travel-buffer 60` flag (adds 60min buffer before/after)
   - `--prefer-start 11` reflects preference for no morning meetings (adjust to your preference)

3. **Apply preferences**: Read `private/preferences.md` for:
   - Number of candidates to offer (3-5)
   - Signature name
   - Any scheduling constraints

---

## Phase 2: Draft Reply

- Format the output from calendar-suggest.js into a polished reply
- Apply tone from `SOUL.md` (external business communication style)
- Signature: YOUR_SIGNATURE (from `private/preferences.md`)

Present the draft to the user for approval before sending.

---

## Phase 3: Post-send processing (fully automatic — do not pause)

After the email is sent, execute the following **without asking for confirmation**:

1. **Register tentative calendar events**: Create `[tentative]` events for ALL proposed dates

   ```bash
   gog calendar create YOUR_WORK_EMAIL \
     --summary "[tentative] PersonName MTG" \
     --from "YYYY-MM-DDTHH:MM:00+09:00" \
     --to "YYYY-MM-DDTHH:MM:00+09:00"
   ```

   - Repeat for each candidate date

2. **Update relationships.md**: Add interaction history to the relevant person's section (skip for service/transactional messages)

3. **Update todo.md**: Add to schedule table + pending-response table

4. **Commit & push**:
   ```bash
   cd YOUR_WORKSPACE && git add -A && git commit -m "schedule: reply to PersonName + tentative calendar events" && git push
   ```

**All 4 steps must complete before the task is considered done.**
