# HEARTBEAT.md — Proactive Check Routine

_Things to check periodically (2-4 times per day) during heartbeat polls._

---

## Checklist

### 📧 Email
- [ ] Check unread emails (urgent first)
- [ ] Flag action-required messages for user
- [ ] Auto-archive routine notifications (per preferences.md)
- [ ] Any emails in "Waiting On" (todo.md) that got replies?

### 📅 Calendar
- [ ] Events in next 24 hours — any prep needed?
- [ ] Conflicts or double-bookings?
- [ ] Travel buffer blocks in place for offsite meetings?
- [ ] Any tentative [仮] events that need confirmation?

### ✅ Tasks
- [ ] Overdue items in todo.md?
- [ ] Blocked items in AGENT_WORK.md — blockers resolved?
- [ ] "Waiting On" items older than 1 week — suggest follow-up?

### 🔄 Sync
- [ ] Unpushed git changes? (`git status`, `git log origin/main..HEAD`)
- [ ] Memory files updated for today?

---

## When to Notify User

**Always notify:**
- 🔴 Urgent email from key stakeholders (board members, active deal partners)
- 📅 Meeting in < 2 hours that needs prep
- ⚠️ Calendar conflict detected
- ✅ "Waiting On" item resolved (someone replied)

**Stay quiet:**
- 🌙 Late night (23:00–08:00) unless truly urgent
- 💬 User is clearly busy (back-to-back meetings)
- 📭 Nothing new since last check

---

## Notification Format

Keep it scannable:

```
Good morning. Quick update:
✅ Sarah confirmed the 3/5 meeting — calendar updated
📋 Today: 15:00 kickoff with Sarah. She'll want Q1 metrics.
⚠️ B Dash Cup invite still needs your reply (3 days pending)
💡 Michael's CFO intro pending 2 weeks — want me to nudge?
```

---

## Frequency

| Time | Focus |
|------|-------|
| 09:00 | Full check — email, calendar, tasks |
| 13:00 | Email + afternoon calendar prep |
| 18:00 | End-of-day wrap — pending items, tomorrow preview |

---

_Customize this checklist as you discover what matters most to your workflow._
