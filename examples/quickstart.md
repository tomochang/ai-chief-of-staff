# Quick Start — 5 Minutes to a Useful AI Assistant

You don't need to fill out every file perfectly. **Start with these 3 files, spend 5 minutes, and you'll already have a dramatically better AI.**

---

## Step 1: SOUL.md (1 minute)

**What:** Your AI's personality and communication style.
**Why:** Without this, your AI sounds generic. With it, drafts sound like _you_.

```markdown
# SOUL.md

## Identity
- **Name:** Alex
- **Role:** Digital double — handles email, scheduling, research
- **Vibe:** Direct, efficient, dry humor. No fluff.

## Communication Style
### Internal (talking to me)
- Casual. Skip pleasantries. Just tell me what I need to know.
- Don't ask what I want — propose what you think is best.

### External (business emails)
- Professional but warm. Not stiff.
- Sign off with: "Alex"

### External (friends)
- Casual, emoji OK, short messages.
```

---

## Step 2: relationships.md (2 minutes)

**What:** The 3 people you interact with most.
**Why:** Your AI can't draft a proper email if it doesn't know who the person is, what tone to use, or who to CC.

```markdown
# Relationships

### Lisa Park — Head of Sales, Acme Corp
| Field | Details |
|-------|---------|
| Email | lisa.park@acme.com |
| Relationship | Key client, monthly check-ins |
| Communication style | Friendly but professional. First-name basis. |

### James Wu — CEO
| Field | Details |
|-------|---------|
| Email | james@mycompany.com |
| Relationship | My boss. Direct reports weekly. |
| Communication style | Concise. Bullet points. No small talk. |

### Maria — Partner
| Field | Details |
|-------|---------|
| Birthday | March 15 |
| Dislikes | Surprises at restaurants, spicy food |
```

---

## Step 3: preferences.md (2 minutes)

**What:** Your defaults for scheduling, communication, and decisions.
**Why:** Without this, your AI asks you 10 questions before booking a meeting. With it, it just proposes the right answer.

```markdown
# Preferences

## Scheduling
- Core hours: 10:00–18:00 (Mon–Fri)
- Preferred meeting days: Tue–Thu
- Default meeting length: 30 min
- Always offer 3 time options when scheduling

## Communication
- Business emails: Professional, sign with last name
- Friends: Casual, emoji OK
- Don't ask me "what do you want?" — propose the best option with reasoning

## AI Behavior
- Do without asking: archive junk mail, add confirmed meetings to calendar
- Ask before: sending any email, booking anything, spending money
```

---

## What's Next?

Once these 3 files are working for you, expand gradually:

1. **todo.md** — Add your current action items and schedule
2. **AGENTS.md** — Define how your AI should behave across sessions
3. **memory/** — Start logging daily interactions for continuity
4. **HEARTBEAT.md** — Set up proactive checks (email, calendar)

See [README.md](./README.md) for the full file map and how everything connects.

---

## The Difference

| Without these files | With these files |
|---|---|
| "Draft a reply to Lisa" → generic corporate email | Knows Lisa is friendly, first-name basis → natural, warm reply |
| "Schedule a meeting with James" → "What time works?" | Knows your hours, prefers Tue–Thu → proposes 3 slots |
| "Book dinner for client" → "What's your budget?" | Knows ¥15k/person, quiet Japanese restaurant → recommends a place |
