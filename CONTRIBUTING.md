# Contributing

Thanks for your interest in contributing to AI Chief of Staff!

## How to Contribute

1. **Fork** the repository
2. **Create a branch** for your change (`git checkout -b feat/my-feature`)
3. **Make your changes** — edit the markdown prompts, scripts, or hooks
4. **Test locally** — run the commands with Claude Code to verify behavior
5. **Submit a PR** with a clear description of what changed and why

## What to Contribute

- New channel integrations (e.g., Discord, Teams)
- Improved classification rules
- Better hook scripts
- Bug fixes in shell scripts
- Documentation improvements
- Translations

## Adding a New Channel

Want to add support for a new messaging platform? Here's what's needed:

### 1. Create the command file

```
commands/<channel>.md
```

Follow the structure of an existing command (e.g., `commands/slack.md` or `commands/chatwork.md`):

- **Fetch**: How to retrieve unread messages (API, CLI tool, bridge, etc.)
- **Classify**: Apply the 4-tier system (`skip` → `info_only` → `meeting_info` → `action_required`)
- **Output format**: Triage results grouped by tier
- **Draft replies**: For `action_required` messages, generate reply drafts
- **Post-send**: Calendar, todo, and relationship updates after sending

### 2. Add classification rules

Define channel-specific skip rules. Common patterns:
- Bot/automated messages → `skip`
- Notifications from the platform itself → `skip`
- Group messages with no direct mention → `info_only`
- Direct messages with unanswered questions → `action_required`

### 3. Add to `/today` (optional)

If the channel should be included in the morning briefing, add a fetch task to `commands/today.md`:
- Add a parallel fetch step
- Add a classification section
- Add output to the briefing template

### 4. Add scripts (if needed)

If the channel requires shell scripts for fetching or sending, add them to `scripts/`:

```
scripts/<channel>-sync.sh    # Fetch messages
scripts/<channel>-send.sh    # Send replies (if applicable)
```

### 5. Update the README

Add the channel to the "Community Integrations" table in `README.md`.

### Example PR

See [Chatwork integration](https://github.com/tomochang/ai-chief-of-staff/commit/785d6c96) by @jagaimo-yaro for a complete example.

## Guidelines

- Keep prompts concise — Claude Code has context limits
- Test with real messages before submitting
- One feature per PR
- Use conventional commit messages (`feat:`, `fix:`, `docs:`)

## Questions?

Open an issue and we'll get back to you.
