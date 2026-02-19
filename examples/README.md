# Examples — Context Files for Your AI Assistant

These example files show how to give your AI the context it needs to be genuinely helpful — not just a chatbot, but a capable assistant that knows your people, preferences, and priorities.

---

## File Overview

| File | Purpose | Priority |
|------|---------|----------|
| **[SOUL.md](./SOUL.md)** | Your AI's identity and communication style | ⭐ Start here |
| **[relationships.md](./relationships.md)** | People, contacts, tone, assistants | ⭐ Start here |
| **[preferences.md](./preferences.md)** | Scheduling, communication, and decision defaults | ⭐ Start here |
| **[todo.md](./todo.md)** | Schedule, action items, waiting-on list | Add next |
| **[AGENTS.md](./AGENTS.md)** | AI behavior rules: startup, approvals, error handling | Add next |
| **[HEARTBEAT.md](./HEARTBEAT.md)** | Proactive check routine (email, calendar, tasks) | Add next |
| **[memory/daily-log.md](./memory/daily-log.md)** | Daily event log template + example | When ready |
| **[memory/AGENT_WORK.md](./memory/AGENT_WORK.md)** | AI's own task queue (separate from human todos) | When ready |
| **[quickstart.md](./quickstart.md)** | 5-minute setup guide — start here if overwhelmed | Guide |
| **[workflow-examples.md](./workflow-examples.md)** | Real scenarios showing how files work together | Guide |

---

## Recommended Setup Order

```
1. SOUL.md              ← Who is your AI? (1 min)
2. relationships.md     ← Top 3 people (2 min)
3. preferences.md       ← Scheduling + communication defaults (2 min)
   --- you're productive now ---
4. todo.md              ← Current schedule + action items
5. AGENTS.md            ← Behavior rules for consistency
6. HEARTBEAT.md         ← Proactive checks
7. memory/              ← Daily logs + AI task queue
```

---

## How Files Connect

```
                    ┌─────────────┐
                    │   SOUL.md   │  ← Identity & tone
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐  ┌────▼─────┐  ┌──▼──────────┐
     │relationships│  │preferences│  │   todo.md   │
     │     .md     │  │   .md    │  │             │
     └──────┬──────┘  └────┬─────┘  └──────┬──────┘
            │              │               │
            │    who +     │  how +        │  what +
            │    tone      │  defaults     │  when
            │              │               │
            └──────────────┼───────────────┘
                           │
                    ┌──────▼──────┐
                    │  AGENTS.md  │  ← Behavior rules
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
     ┌────────▼────────┐    ┌──────────▼──────────┐
     │  HEARTBEAT.md   │    │      memory/        │
     │ (proactive      │    │  daily-log.md       │
     │  checks)        │    │  AGENT_WORK.md      │
     └─────────────────┘    └─────────────────────┘
```

---

## Quick Start

**Don't have time to read everything?** → Start with [quickstart.md](./quickstart.md)

**Want to see how it all works together?** → Read [workflow-examples.md](./workflow-examples.md)

**Ready to set up properly?** → Follow the setup order above, using the "Quick Start (Minimal)" section at the top of each file.
