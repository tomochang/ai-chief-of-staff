# Post-Send Checklist (Mandatory)

After drafting a reply and the user reports "sent" / "done" / etc., **immediately execute** the following without asking for confirmation:

1. **Calendar update** -- If there are schedule additions/changes/deletions, reflect them in the calendar (for reschedules: delete old event + create new [tentative] event)
2. **Todo file update** -- Update schedule table + action-waiting table
3. **Relationships file update** -- Append interaction history to the relevant person's section (skip if no relevant person, e.g., service administrative correspondence)
4. **Commit & push** -- `cd $WORKSPACE && git add -A && git commit -m "<summary>" && git push`

**"Sent" is the trigger for follow-up processing.** Do not end the workflow at draft approval.
