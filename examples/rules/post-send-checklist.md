# Post-Send Checklist (Mandatory)

After drafting a reply and the user reports "sent" / "done" / etc., **immediately execute** the following without asking for confirmation:

1. **Calendar update** -- If there are schedule additions/changes/deletions, reflect them in the calendar (for reschedules: delete old event + create new [tentative] event)
2. **Tentative calendar booking (when proposing dates)** -- If the sent message proposed candidate dates, **register ALL candidate dates as [tentative] events immediately.** Do not wait for confirmation. When a reply arrives, delete all dates except the confirmed one
3. **Invite attendees** -- If the calendar event has other participants, **add ALL of them as attendees.** Do this without being asked. Internal team members are mandatory invites
4. **Todo file update** -- Update schedule table + action-waiting table
5. **Relationships file update** -- Append interaction history to the relevant person's section (skip if no relevant person, e.g., service administrative correspondence)
6. **Commit & push** -- `cd $WORKSPACE && git add -A && git commit -m "<summary>" && git push`

**"Sent" is the trigger for follow-up processing.** Do not end the workflow at draft approval.

## Calendar Integration for Date Proposals (Mandatory)

When candidate dates are proposed in a message, execute the following **at send time** (not after sending):

```
Send → Register [tentative] calendar events (ALL candidate dates) → Add attendees (ALL participants) → Update todo → Update relationships → Commit & push
```

**Do NOT:**
- Propose candidate dates without adding them to the calendar
- Add calendar events without inviting attendees
- Postpone with "I'll add it when they reply"
