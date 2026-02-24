# AI Chief of Staff

**Turn Claude Code into your personal chief of staff.**

Every morning, you type `/today` in your terminal. That's it:

- **20 unread emails, auto-classified** — bot notifications and newsletters get archived without you ever seeing them. Only messages that actually need your attention show up
- **Slack mentions and DMs, surfaced** — unanswered threads bubble up, noise stays hidden
- **LINE messages, triaged** — official accounts skipped, personal chats needing replies flagged with context
- **Messenger conversations, triaged** — page notifications filtered, 1-on-1 chats needing responses surfaced
- **Today's calendar, displayed** — if a meeting link is missing, it gets auto-filled from your email. Non-routine meetings flagged for prep
- **Stale tasks and pending responses, triaged** — pending responses over 3 days get flagged, overdue tasks surfaced. Zero undecided items
- **Draft replies for everything that needs one** — written in your tone, with your signature, informed by your relationship history with each person
- **Scheduling? Free slots auto-calculated** — pulled from your calendar, respecting your preferences (no mornings, travel buffers, weekdays only)
- **After you send: calendar, todo, and notes update themselves** — enforced by a hook, so nothing falls through the cracks

The concept is simple. Take five inputs — email, Slack, LINE, Messenger, calendar — and pipe them through **classify → triage → assist → execute → record**. Claude Code's `/command` system becomes the workflow engine. Hooks enforce reliability. Git persists your knowledge.

No code to write. No SDK. No API wrapper. **Edit a markdown file and the behavior changes instantly.**

```
$ claude /today

# Today's Briefing — Feb 18, 2026 (Tue)

## Schedule (3)
| Time        | Event                  | Location          | Prep?  |
|-------------|------------------------|-------------------|--------|
| 10:00-11:00 | Team standup           | Zoom: https://... | —      |
| 14:00-15:00 | Client meeting         | Marunouchi Tower  | ⚠️     |
| 19:00-      | Dinner @Ebisu          | Tatsuya           | —      |

## Email — Skipped (5) → auto-archived
## Email — Action Required (2)

### 1. Jane Smith <jane@example.com>
**Subject**: Q2 project kickoff timing
**Summary**: Asking when we can schedule the kickoff meeting

**Draft reply**:
Thanks for reaching out. Here are some times that
work on my end: ...

→ [Send] [Edit] [Skip]

## LINE — Action Required (1)

### 1. Taro Tanaka
**Last message**: Are you free this weekend?
**Context**: Friend, last met 2/10

**Draft reply**: ...

→ [Send] [Edit] [Skip]

## Triage Queue
- Stale/critical pending responses: 2
- Overdue tasks: 1
→ All items decided in Step 3
```

---

## How It Works

This kit gives Claude Code a **4-tier triage system** for all your communication channels, plus a **task triage step** that ensures zero undecided items:

| Category | Condition | Action |
|----------|-----------|--------|
| **skip** | Bot notifications, noreply, auto-generated, official accounts | Auto-archive / ignore (hidden from you) |
| **info_only** | CC'd emails, receipts, group chat chatter, internal shares | Show summary only |
| **meeting_info** | Calendar invites, Zoom/Teams links, location shares | Cross-reference calendar & auto-update |
| **action_required** | Direct messages, questions, scheduling requests | Generate draft reply |

After you send a reply, a **hook-enforced checklist** ensures nothing falls through the cracks:

1. Update calendar (create tentative events for proposed dates)
2. Update your relationship notes (who you talked to, what about)
3. Update your todo list
4. Update pending response table (follow-up sent dates, resolved items removed, wait deadlines set)
5. Git commit & push (version-control your knowledge)
6. Archive the processed email
7. Update LINE/Messenger triage files

**The hook blocks completion until all steps are done.** You can't accidentally skip post-send processing.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Commands (.claude/commands/*.md)                │
│  /mail  /slack  /today  /schedule-reply          │
│  ↳ User-facing entry points (interactive)       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Skills (skills/*/SKILL.md)                      │
│  /line  /messenger  /schedule-reply              │
│  ↳ Reusable multi-phase workflows               │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Rules (.claude/rules/*.md)                      │
│  ↳ Behavioral constraints for reliability       │
│  ↳ Pre/post-send checklists, session boot       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Hooks (hooks/post-send.sh)                      │
│  ↳ PostToolUse enforcement layer                │
│  ↳ Blocks completion until checklist done       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Scripts (scripts/)                              │
│  calendar-suggest.js, line-*.sh, messenger-*.sh  │
│  core/msg-core.sh (shared messaging utilities)   │
│  ↳ Deterministic logic (no LLM needed)          │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Autonomous Layer (scripts/autonomous/)           │
│  dispatcher.sh → today.sh, morning-briefing.sh   │
│  slack-bridge.sh, notify.sh                      │
│  ↳ Scheduled via launchd/cron — runs unattended │
│  ↳ Uses claude -p (non-interactive mode)        │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Knowledge Files (private/)                      │
│  ↳ relationships.md, todo.md, preferences.md    │
│  ↳ Git-versioned persistent memory              │
└─────────────────────────────────────────────────┘
```

### Why this design?

**Commands are prompts, not code.** Each `.md` file is a structured prompt that tells Claude Code what to do step-by-step. No SDK, no API wrapper, no build system. You edit a markdown file and the behavior changes instantly.

**Hooks enforce reliability.** LLMs skip steps. They forget post-processing. The `PostToolUse` hook intercepts every `send` command and blocks until the checklist is done. This is the single most important piece — without it, the system works 80% of the time instead of 99%.

**Rules constrain LLM behavior.** Rules in `.claude/rules/` fire automatically on every session. They enforce checklists (pre-send verification, post-send follow-through), session startup sequences, and behavioral patterns. Unlike prompt instructions that get forgotten, rules are injected by the system — the LLM cannot skip them.

**Scripts handle deterministic logic.** Calendar availability calculation doesn't need an LLM. `calendar-suggest.js` fetches your calendar, finds free slots, respects your preferences (no mornings, travel buffers), and outputs formatted candidates. Claude Code calls this script instead of trying to reason about time math. LINE and Messenger scripts handle message syncing, context collection, and sending through a shared messaging core.

**The autonomous layer runs unattended.** `scripts/autonomous/` contains scripts that run on a schedule (via launchd or cron) using `claude -p` (non-interactive mode). The dispatcher routes to specialized handlers: `today.sh` triages all 5 channels in parallel, `slack-bridge.sh` turns Slack DMs into a bidirectional Claude interface, and `notify.sh` sends results back to you via Slack.

**Knowledge files are your memory.** Claude Code sessions are stateless. Your relationships, preferences, and todos persist in markdown files that get version-controlled with git. Every session reads these files to maintain continuity.

---

## Supported Channels

| Channel | Fetch method | Send method | Triage file |
|---------|-------------|-------------|-------------|
| **Email** | `gog gmail search` (or any Gmail CLI) | `gog gmail send` | Auto-archive |
| **Slack** | Slack MCP server | Slack MCP `conversations_add_message` | — |
| **LINE** | Matrix bridge (mautrix-line) or custom sync script | Matrix bridge or custom send script | `private/drafts/line-replies-YYYY-MM-DD.md` |
| **Messenger** | Chrome CDP (Playwright) | Chrome AppleScript | `private/drafts/messenger-replies-YYYY-MM-DD.md` |

LINE and Messenger use a **3-layer architecture**: skill rules (classification, tone) → scripts (context collection, sending, validation) → data files (triage status, relationship notes, send logs).

---

## Autonomous Execution

The `scripts/autonomous/` directory enables **unattended operation** — Claude runs on a schedule without you opening a terminal.

### How it works

1. **`dispatcher.sh`** is the entry point. It accepts a mode (`triage`, `morning`, `bridge`, `today`) and launches the corresponding handler
2. **`today.sh`** fetches all 5 channels in parallel (email, Slack, LINE, Messenger, calendar), pipes each through AI classification using channel-specific prompts, and posts a summary to your Slack DM
3. **`morning-briefing.sh`** generates a morning briefing combining calendar, todos, overnight triage results, and pending approvals
4. **`slack-bridge.sh`** polls your Slack DMs and routes messages to `claude -p`, creating a bidirectional Claude ↔ Slack interface
5. **`notify.sh`** sends formatted notifications to your Slack DM

All autonomous scripts use `claude -p` (pipe/non-interactive mode) with `--append-system-prompt` to inject context. Results are posted to Slack via the Web API.

### HITL (Human-in-the-Loop) Approval

The `lib/approval.sh` module implements a Slack-based approval flow. When the autonomous agent wants to send a message or update your calendar, it posts a preview to Slack and waits for your reaction (checkmark to approve, X to reject). This prevents the agent from acting without your consent.

---

## Scheduling (launchd / cron)

Example plist files are in `examples/launchd/`:

| File | Schedule | What it does |
|------|----------|--------------|
| `com.chief-of-staff.today.plist` | Every hour | Run 5-channel triage, post summary to Slack |
| `com.chief-of-staff.morning.plist` | Daily 07:30 | Morning briefing with calendar + todos |

### Setup (macOS)

```bash
# 1. Copy and edit the plist (replace YOUR_HOME, YOUR_WORKSPACE)
cp examples/launchd/com.chief-of-staff.today.plist ~/Library/LaunchAgents/

# 2. Edit paths — launchd does NOT expand $HOME or ~
vim ~/Library/LaunchAgents/com.chief-of-staff.today.plist

# 3. Load
launchctl load ~/Library/LaunchAgents/com.chief-of-staff.today.plist

# 4. Check status
launchctl list | grep chief-of-staff
```

### Setup (Linux / cron)

```bash
# Add to crontab
crontab -e

# Every hour
0 * * * * /path/to/scripts/autonomous/dispatcher.sh today >> /tmp/chief-of-staff.log 2>&1

# Daily at 07:30
30 7 * * * /path/to/scripts/autonomous/dispatcher.sh morning >> /tmp/chief-of-staff.log 2>&1
```

---

## Rules System

Rules in `.claude/rules/` are behavioral constraints that Claude Code loads automatically on every session. Unlike prompt instructions, rules are **system-injected** — the LLM cannot choose to skip them.

Example rules are in `examples/rules/`:

| Rule | Purpose |
|------|---------|
| `pre-send-checklist.md` | Verify CC recipients before sending |
| `post-send-checklist.md` | Enforce calendar/todo/relationships updates after sending |
| `session-start.md` | Load knowledge files at session start |
| `calendar-update.md` | Require evidence (email/Slack) before modifying calendar |
| `self-awareness.md` | LLM self-correction patterns (anti-hallucination, anti-skip) |
| `parallel-execution.md` | Run independent tasks concurrently |
| `trigger-workflows.md` | Map keywords to workflow handlers |

To use: copy desired rules to your workspace's `.claude/rules/` directory.

---

## LINE & Messenger Scripts

Scripts for LINE and Messenger messaging. LINE uses a Matrix bridge; Messenger uses Chrome CDP/AppleScript.

### Prerequisites

**LINE:**
- A [Matrix](https://matrix.org/) homeserver (e.g., Synapse)
- [mautrix-line](https://github.com/mautrix/line) bridge
- Environment variables: `MATRIX_SERVER`, `MATRIX_ADMIN_TOKEN`

**Messenger:**
- Google Chrome with Messenger logged in (macOS)
- Node.js + Playwright (for Chrome CDP unread check)

### Scripts

| Script | Channel | Purpose |
|--------|---------|---------|
| `core/msg-core.sh` | Shared | Utilities (relationship lookup, status tracking, Matrix API for LINE) |
| `line-sync.sh` | LINE | Sync messages via Matrix bridge |
| `line-draft.sh` | LINE | Collect context for reply drafts |
| `line-review.sh` | LINE | Validate drafts (emoji, tone, length) |
| `line-send.sh` | LINE | Send via Matrix + verify delivery |
| `line-rooms.sh` | LINE | Search rooms via VPS Matrix bridge |
| `messenger-draft.sh` | Messenger | Collect context via Chrome CDP (Matrix fallback) |
| `messenger-send.sh` | Messenger | Send via Chrome AppleScript |

### Skills

Example skills for LINE and Messenger are in `examples/skills/`:
- `line-skill.md` — Full LINE workflow with phases, rules, and troubleshooting
- `messenger-skill.md` — Full Messenger workflow with Chrome CDP/AppleScript

---

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- A Gmail CLI tool (this kit uses [`gog`](https://github.com/pterm/gog), but any CLI that can search/send/archive Gmail works)
- Node.js 18+ (for `calendar-suggest.js`)
- (Optional) Slack MCP server configured in Claude Code
- (Optional) Slack Bot Token with `chat:write`, `channels:history`, `im:history` scopes — for autonomous mode
- (Optional) Matrix bridge for LINE (mautrix-line)
- (Optional) Google Chrome for Messenger (Chrome CDP + AppleScript)

### 1. Copy template files

```bash
# Commands go in your Claude Code commands directory
cp commands/mail.md ~/.claude/commands/
cp commands/today.md ~/.claude/commands/

# Skills, hooks, and scripts go in your workspace
mkdir -p ~/your-workspace/{skills/schedule-reply,hooks,scripts/core,scripts/autonomous,private}
cp skills/schedule-reply/SKILL.md ~/your-workspace/skills/schedule-reply/
cp hooks/post-send.sh ~/your-workspace/hooks/
cp scripts/calendar-suggest.js ~/your-workspace/scripts/
cp examples/SOUL.md ~/your-workspace/

# (Optional) LINE/Messenger scripts
cp scripts/core/msg-core.sh ~/your-workspace/scripts/core/
cp scripts/line-*.sh ~/your-workspace/scripts/
cp scripts/messenger-*.sh ~/your-workspace/scripts/

# (Optional) Autonomous scripts
cp -r scripts/autonomous/ ~/your-workspace/scripts/autonomous/

# (Optional) Rules
mkdir -p ~/your-workspace/.claude/rules
cp examples/rules/*.md ~/your-workspace/.claude/rules/
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
| `YOUR_SLACK_USER_ID` | `U1234567890` | config.json, slack-api.sh, slack-bridge.sh |
| `YOUR_SLACK_BOT_TOKEN` | `xoxb-...` | .env |
| `YOUR_SLACK_MENTIONS` | `@alice, @Alice` | triage-slack.md |
| `YOUR_MATRIX_USER_PARTIAL` | `ualice` | msg-core.sh, line-sync.sh |
| `YOUR_VPS_HOST` | `root@your-server.com` | line-rooms.sh |
| `YOUR_LINE_SYNC_COMMAND` | `bash scripts/line-sync.sh` | today.md |
| `YOUR_LINE_SEND_COMMAND` | `bash scripts/line-send.sh` | today.md |
| `YOUR_MESSENGER_SEND_COMMAND` | `bash scripts/messenger-send.sh` | today.md |
| `YOUR_LINE_SKIP_ACCOUNTS` | `Starbucks, Nike, ...` | today.md |
| `YOUR_MATRIX_SERVER` | `http://localhost:8008` | today.md, msg-core.sh |
| `YOUR_MATRIX_ADMIN_TOKEN` | (env var) | today.md, msg-core.sh |
| `YOUR_WORK_DOMAIN` | `company.com` | today.md, triage-email.md |
| `YOUR_TODO_FILE` | `private/todo.md` | today.sh, morning-briefing.sh |
| `YOUR_TASK_LIST_COMMAND` | `gog tasks list` | today.md (optional) |

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

Add pre-approved permissions for the CLI commands you'll use frequently. In `.claude/settings.local.json`:

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
claude /today         # Morning briefing (email + Slack + LINE + Messenger + calendar)
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

### Adding a new channel

The system is designed to be channel-agnostic. To add a new channel (e.g., Discord, WhatsApp, Linear):

1. Copy `commands/mail.md` or the LINE/Messenger sections in `today.md` as a starting template
2. Replace the fetch/send commands with your channel's integration (API, bridge, CLI tool)
3. Keep the same 4-tier classification — it works for any message source
4. Add draft-context and send scripts if applicable
5. Add a post-send hook if the channel supports sending

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
ai-chief-of-staff/
├── commands/
│   ├── mail.md                    # /mail — Email triage
│   ├── slack.md                   # /slack — Slack triage
│   ├── today.md                   # /today — Morning briefing (all channels)
│   └── schedule-reply.md          # /schedule-reply — Scheduling workflow
├── skills/
│   └── schedule-reply/
│       └── SKILL.md               # Multi-phase scheduling skill
├── hooks/
│   └── post-send.sh               # PostToolUse hook for send enforcement
├── scripts/
│   ├── calendar-suggest.js        # Free slot finder
│   ├── core/
│   │   └── msg-core.sh            # Shared Matrix messaging utilities
│   ├── line-sync.sh               # LINE message sync via Matrix
│   ├── line-draft.sh              # LINE draft context collection
│   ├── line-review.sh             # LINE draft validation
│   ├── line-send.sh               # LINE send + verify
│   ├── line-rooms.sh              # LINE room search
│   ├── messenger-draft.sh         # Messenger draft context
│   ├── messenger-send.sh          # Messenger send (Chrome AppleScript)
│   └── autonomous/
│       ├── dispatcher.sh          # Entry point for all autonomous modes
│       ├── today.sh               # 5-channel unified triage
│       ├── morning-briefing.sh    # Morning briefing generator
│       ├── slack-bridge.sh        # Bidirectional Slack ↔ Claude bridge
│       ├── notify.sh              # Slack DM notification sender
│       ├── config.json            # Configuration for autonomous modes
│       ├── lib/
│       │   ├── common.sh          # Shared utilities (logging, locking)
│       │   ├── slack-api.sh       # Slack Web API wrapper
│       │   └── approval.sh        # HITL approval flow via Slack
│       └── prompts/
│           ├── triage-email.md    # Email classification prompt
│           ├── triage-slack.md    # Slack classification prompt
│           ├── triage-line.md     # LINE classification prompt
│           ├── triage-messenger.md # Messenger classification prompt
│           └── today-briefing.md  # Briefing generator prompt
├── examples/
│   ├── SOUL.md                    # Example persona configuration
│   ├── rules/
│   │   ├── pre-send-checklist.md  # Pre-send verification
│   │   ├── post-send-checklist.md # Post-send enforcement
│   │   ├── session-start.md       # Session startup sequence
│   │   ├── calendar-update.md     # Evidence-based calendar updates
│   │   ├── self-awareness.md      # LLM self-correction patterns
│   │   ├── parallel-execution.md  # Parallel task execution
│   │   └── trigger-workflows.md   # Keyword → workflow triggers
│   ├── skills/
│   │   ├── line-skill.md          # LINE messaging skill
│   │   └── messenger-skill.md     # Messenger messaging skill
│   └── launchd/
│       ├── com.chief-of-staff.today.plist    # Hourly triage
│       └── com.chief-of-staff.morning.plist  # Daily briefing
├── README.md                      # English documentation
└── README.ja.md                   # Japanese documentation
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

### Why rules instead of just prompt instructions?

Prompt instructions get forgotten. You can write "ALWAYS update the calendar after sending" in your system prompt, and Claude will still skip it 20% of the time. Rules in `.claude/rules/` are system-injected on every session — the LLM cannot choose to ignore them. Combined with hooks (which enforce at the tool level), you get two layers of reliability.

### Why an autonomous layer?

Interactive mode requires you to open a terminal and type a command. The autonomous layer (`scripts/autonomous/`) runs on a schedule via launchd or cron, using `claude -p` (non-interactive mode). This means your triage happens even when you're not at your desk. Results are posted to Slack, and the HITL approval flow ensures you maintain control.

### Why a Matrix bridge for LINE?

The LINE API requires a business account. A Matrix bridge ([mautrix-line](https://github.com/mautrix/line)) provides a unified API layer that works with personal accounts. The bridge handles authentication, message syncing, and delivery — your scripts just talk to the Matrix HTTP API.

### Why Chrome CDP/AppleScript for Messenger?

Messenger has no personal-use API. Instead of a bridge, we use Chrome CDP (Playwright) to read unread messages and Chrome AppleScript to send them. This requires Chrome running with Messenger logged in on a Mac. `document.execCommand('insertText')` handles React-compatible text input, and `KeyboardEvent('keydown', {key:'Enter'})` triggers send. The scripts handle focus management, delays for Messenger's reactive updates, and E2EE chat URL patterns.

---

## FAQ

**Q: Does this work with Outlook/Exchange?**
A: The classification logic is email-provider agnostic. You'd need to swap `gog gmail` commands with your Outlook CLI tool (e.g., `microsoft-graph-cli` or a custom script).

**Q: Can I use this without Slack/LINE/Messenger?**
A: Yes. Each channel is independent. Use just `/mail`, or `/today` with only the channels you have configured. The system gracefully handles missing channels.

**Q: Is my data sent to Anthropic?**
A: Yes — Claude Code processes your messages through the Anthropic API. The same privacy considerations as using Claude with any sensitive data apply. If this is a concern, consider running with a self-hosted model.

**Q: How much does this cost per day?**
A: A typical `/today` briefing (20 emails + Slack + LINE + Messenger + calendar) uses roughly 50-150k tokens. At Opus pricing, that's ~$1-3/day. Using Sonnet drops this to ~$0.15-0.50/day.

**Q: Do I need all five channels?**
A: No. Start with email only (`/mail`), then add channels as you set up integrations. The `/today` command automatically skips channels that aren't configured.

---

## Credits

Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic.

Inspired by the idea that your AI assistant should handle the *boring* parts of communication — classification, scheduling, archiving — so you can focus on the parts that actually need your brain.

---

## License

MIT
