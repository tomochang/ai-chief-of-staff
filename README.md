# Claude Code Triage Kit

**Turn Claude Code into your personal communication OS.**

Every morning, you type `/today` in your terminal. That's it:

- **20 unread emails, auto-classified** — bot notifications and newsletters get archived without you ever seeing them. Only messages that actually need your attention show up
- **Slack mentions and DMs, surfaced** — unanswered threads bubble up, noise stays hidden
- **Today's calendar, displayed** — if a meeting link is missing, it gets auto-filled from your email
- **Draft replies for everything that needs one** — written in your tone, with your signature, informed by your relationship history with each person
- **Scheduling? Free slots auto-calculated** — pulled from your calendar, respecting your preferences (no mornings, travel buffers, weekdays only)
- **After you send: calendar, todo, and notes update themselves** — enforced by a hook, so nothing falls through the cracks

The concept is simple. Take three inputs — email, Slack, calendar — and pipe them through **classify → assist → execute → record**. Claude Code's `/command` system becomes the workflow engine. Hooks enforce reliability. Git persists your knowledge.

No code to write. No SDK. No API wrapper. **Edit a markdown file and the behavior changes instantly.**

```
$ claude /today

# Today's Briefing — Feb 18, 2026 (Tue)

## Schedule (3)
| Time        | Event                  | Location          |
|-------------|------------------------|-------------------|
| 10:00-11:00 | Team standup           | Zoom: https://... |
| 14:00-15:00 | Client meeting         | Marunouchi Tower  |
| 19:00-      | Dinner @Ebisu          | Tatsuya           |

## Email — Skipped (5) → auto-archived
## Email — Action Required (2)

### 1. Jane Smith <jane@example.com>
**Subject**: Q2 project kickoff timing
**Summary**: Asking when we can schedule the kickoff meeting

**Draft reply**:
Thanks for reaching out. Here are some times that
work on my end: ...

→ [Send] [Edit] [Skip]
```

---

## How It Works

This kit gives Claude Code a **4-tier triage system** for email and Slack:

| Category | Condition | Action |
|----------|-----------|--------|
| **skip** | Bot notifications, noreply, auto-generated | Auto-archive (hidden from you) |
| **info_only** | CC'd emails, receipts, internal shares | Show summary only |
| **meeting_info** | Calendar invites, Zoom/Teams links, location shares | Cross-reference calendar & auto-update |
| **action_required** | Direct recipient, contains questions, scheduling requests | Generate draft reply |

After you send a reply, a **hook-enforced checklist** ensures nothing falls through the cracks:

1. Update calendar (create tentative events for proposed dates)
2. Update your relationship notes (who you talked to, what about)
3. Update your todo list
4. Git commit & push (version-control your knowledge)
5. Archive the processed email

**The hook blocks completion until all steps are done.** You can't accidentally skip post-send processing.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Commands (.claude/commands/*.md)            │
│  /mail  /slack  /today  /schedule-reply      │
│  ↳ User-facing entry points                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Skills (skills/*/SKILL.md)                  │
│  ↳ Reusable multi-phase workflows           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Hooks (hooks/post-send.sh)                  │
│  ↳ PostToolUse enforcement layer            │
│  ↳ Blocks completion until checklist done   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Scripts (scripts/calendar-suggest.js)       │
│  ↳ Deterministic logic (no LLM needed)      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Knowledge Files (private/)                  │
│  ↳ relationships.md, todo.md, preferences.md│
│  ↳ Git-versioned persistent memory          │
└─────────────────────────────────────────────┘
```

### Why this design?

**Commands are prompts, not code.** Each `.md` file is a structured prompt that tells Claude Code what to do step-by-step. No SDK, no API wrapper, no build system. You edit a markdown file and the behavior changes instantly.

**Hooks enforce reliability.** LLMs skip steps. They forget post-processing. The `PostToolUse` hook intercepts every `gmail send` command and blocks until the checklist is done. This is the single most important piece — without it, the system works 80% of the time instead of 99%.

**Scripts handle deterministic logic.** Calendar availability calculation doesn't need an LLM. `calendar-suggest.js` fetches your calendar, finds free slots, respects your preferences (no mornings, travel buffers), and outputs formatted candidates. Claude Code calls this script instead of trying to reason about time math.

**Knowledge files are your memory.** Claude Code sessions are stateless. Your relationships, preferences, and todos persist in markdown files that get version-controlled with git. Every session reads these files to maintain continuity.

---

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- A Gmail CLI tool (this kit uses [`gog`](https://github.com/pterm/gog), but any CLI that can search/send/archive Gmail works)
- Node.js 18+ (for `calendar-suggest.js`)
- (Optional) Slack MCP server configured in Claude Code

### 1. Copy template files

```bash
# Commands go in your Claude Code commands directory
cp commands/mail.md ~/.claude/commands/
cp commands/slack.md ~/.claude/commands/
cp commands/today.md ~/.claude/commands/
cp commands/schedule-reply.md ~/.claude/commands/

# Skills, hooks, and scripts go in your workspace
mkdir -p ~/your-workspace/{skills/schedule-reply,hooks,scripts,private}
cp skills/schedule-reply/SKILL.md ~/your-workspace/skills/schedule-reply/
cp hooks/post-send.sh ~/your-workspace/hooks/
cp scripts/calendar-suggest.js ~/your-workspace/scripts/
cp examples/SOUL.md ~/your-workspace/
```

### 2. Configure your identity

Edit the placeholder values in each file. Search for `YOUR_` to find all placeholders:

```bash
grep -r "YOUR_" commands/ skills/ hooks/ scripts/
```

Key placeholders to replace:

| Placeholder | Example | Used in |
|-------------|---------|---------|
| `YOUR_EMAIL` | `alice@gmail.com` | mail.md, today.md |
| `YOUR_WORK_EMAIL` | `alice@company.com` | mail.md, today.md |
| `YOUR_NAME` | `Alice` | slack.md, today.md |
| `YOUR_SIGNATURE` | `Alice` | mail.md, schedule-reply |
| `YOUR_WORKSPACE` | `~/workspace` | hooks, scripts |
| `YOUR_CALENDAR_ID` | `primary` | calendar-suggest.js |
| `YOUR_SKIP_DOMAINS` | `@company-internal.com` | mail.md |

### 3. Set up your knowledge files

Create the initial knowledge files:

```bash
cd ~/your-workspace

# Your relationship notes (who you know, context for replies)
cat > private/relationships.md << 'EOF'
# Relationships

## John Smith (Acme Corp)
- Role: VP Engineering
- Context: Working on API integration project
- Last: 2/15 discussed timeline for Q2 launch
EOF

# Your preferences
cat > private/preferences.md << 'EOF'
# Preferences

## Scheduling
- Prefer afternoons (11:00+)
- Weekdays only, 9:00-18:00
- Offer 3-5 time candidates
- Signature: YOUR_SIGNATURE
EOF

# Your todo list
cat > private/todo.md << 'EOF'
# Todo

## Upcoming
| Date | Event | Status |
|------|-------|--------|
EOF
```

### 4. Configure the hook

Add the post-send hook to your Claude Code settings. In your project's `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/your-workspace/hooks/post-send.sh"
          }
        ]
      }
    ]
  }
}
```

### 5. Set up permissions

Add pre-approved permissions for the Gmail CLI commands you'll use frequently. In `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(gog gmail search*)",
      "Bash(gog gmail thread*)",
      "Bash(gog gmail send*)",
      "Bash(gog gmail thread modify*)",
      "Bash(gog calendar*)",
      "Bash(node */scripts/calendar-suggest.js*)",
      "Skill(mail)",
      "Skill(slack)",
      "Skill(today)",
      "Skill(schedule-reply)"
    ]
  }
}
```

### 6. Try it

```bash
claude /mail          # Triage your email
claude /slack         # Triage your Slack
claude /today         # Morning briefing (email + Slack + calendar)
claude /schedule-reply "Reply to John about next week's meeting"
```

---

## Customization Guide

### Adding skip rules

In `commands/mail.md`, add patterns to the skip section:

```markdown
### skip (auto-archive)
- From contains `noreply`, `no-reply`, `notification`
- From contains `@github.com`, `@slack.com`
- Subject contains `[GitHub]`, `[Jira]`
+ - From contains `@your-noisy-service.com`
+ - Subject contains `[Your Internal Tool]`
```

### Changing the tone

Edit `SOUL.md` to match your communication style. The triage commands reference `SOUL.md` when generating reply drafts:

```markdown
## External (Business)
- Professional but warm
- Direct, no filler
- Always end with your name

## Internal (Team)
- Casual but respectful
- Emoji OK
- Skip formalities
```

### Adding a new channel (e.g., Discord, Linear)

1. Copy `commands/slack.md` as a starting template
2. Replace the Slack MCP tool calls with your channel's integration
3. Keep the same 4-tier classification (it works for any message source)
4. Add a post-send hook if the channel supports sending

### Multi-account support

The mail command supports multiple accounts out of the box. Add accounts to the search step:

```markdown
### Step 1: Fetch unread

```bash
# Account 1
gog gmail search "is:unread ..." --account YOUR_EMAIL

# Account 2
gog gmail search "is:unread ..." --account YOUR_WORK_EMAIL

# Account 3 (add as many as you need)
gog gmail search "is:unread ..." --account YOUR_OTHER_EMAIL
```

---

## File Reference

```
claude-code-triage/
├── commands/
│   ├── mail.md              # /mail — Email triage
│   ├── slack.md             # /slack — Slack triage
│   ├── today.md             # /today — Morning briefing
│   └── schedule-reply.md    # /schedule-reply — Scheduling workflow
├── skills/
│   └── schedule-reply/
│       └── SKILL.md         # Multi-phase scheduling skill
├── hooks/
│   └── post-send.sh         # PostToolUse hook for send enforcement
├── scripts/
│   └── calendar-suggest.js  # Free slot finder
├── examples/
│   └── SOUL.md              # Example persona configuration
└── README.md                # This file
```

---

## Design Decisions

### Why markdown prompts instead of code?

A prompt-based system means **zero build step, zero deployment, instant iteration**. You edit `mail.md`, save, and the next `/mail` invocation uses the new behavior. Compare this to building a traditional email automation tool — you'd need an API server, OAuth flow, webhook handlers, a database, and a deployment pipeline. Here, the LLM *is* the runtime.

### Why hooks for reliability?

The biggest failure mode of LLM-driven workflows is **forgetting steps**. Claude will happily send your email and move on without updating your calendar or relationship notes. The PostToolUse hook catches every `send` command and injects a reminder that *blocks* the response. This is cheaper and more reliable than adding "DON'T FORGET" to every prompt.

### Why git for persistence?

Your relationship notes, preferences, and todos are valuable data. Git gives you:
- **Version history** — see how relationships evolve over time
- **Multi-device sync** — push to a private repo, pull from anywhere
- **Rollback** — undo accidental changes
- **Audit trail** — every AI-generated update is in the commit log

### Why a separate script for calendar logic?

LLMs are bad at time math. "Find me 3 free 1-hour slots in the next 2 weeks, avoiding mornings" requires date arithmetic, timezone handling, and intersection calculations. `calendar-suggest.js` does this deterministically in ~100ms. The LLM's job is to format the output and compose the email — not to compute availability.

---

## FAQ

**Q: Does this work with Outlook/Exchange?**
A: The classification logic is email-provider agnostic. You'd need to swap `gog gmail` commands with your Outlook CLI tool (e.g., `microsoft-graph-cli` or a custom script).

**Q: Can I use this without Slack?**
A: Yes. Just use `/mail` and `/schedule-reply`. The Slack commands are independent.

**Q: Is my email data sent to Anthropic?**
A: Yes — Claude Code processes your emails through the Anthropic API. The same privacy considerations as using Claude with any sensitive data apply. If this is a concern, consider running with a self-hosted model.

**Q: How much does this cost per day?**
A: A typical `/today` briefing (20 emails + Slack + calendar) uses roughly 50-100k tokens. At Opus pricing, that's ~$1-2/day. Using Sonnet drops this to ~$0.15-0.30/day.

---

## Credits

Built by [your name] using [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic.

Inspired by the idea that your AI assistant should handle the *boring* parts of communication — classification, scheduling, archiving — so you can focus on the parts that actually need your brain.

---

## License

MIT
