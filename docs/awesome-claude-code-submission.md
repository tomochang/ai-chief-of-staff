# awesome-claude-code Issue Submission Draft

Submit at: https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

---

## Display Name

AI Chief of Staff

## Category

Agent Skills

## Sub-Category

(leave blank)

## Primary Link

https://github.com/tomochang/ai-chief-of-staff

## Author Name

tomochang

## Author Link

https://github.com/tomochang

## License

MIT

## Description

Turn Claude Code into a personal chief of staff that triages email, Slack, LINE, and Messenger in one command. Uses a 4-tier classification system (skip/info/meeting/action), generates draft replies in your tone, and enforces post-send follow-through (calendar, todo, relationship notes) via PostToolUse hooks. Includes autonomous execution via launchd/cron and a rules system for LLM behavioral constraints.

## Validate Claims

Clone the repo, copy `commands/mail.md` to `~/.claude/commands/`, replace `YOUR_EMAIL` and `YOUR_SIGNATURE` placeholders, then run `claude /mail`. It will fetch unread Gmail via any Gmail CLI, classify messages into 4 tiers, auto-archive skip-tier messages, and generate draft replies for action-required messages. The PostToolUse hook blocks completion until calendar/todo/relationship notes are updated after sending.

## Specific Task(s)

1. Run `/mail` to triage unread email — bot notifications get auto-archived, action-required messages get draft replies with your signature and tone
2. Run `/today` for a unified morning briefing across all configured channels (email + Slack + LINE + Messenger + calendar) with stale task detection
3. Run `/schedule-reply` to compose a scheduling reply with auto-calculated free slots from your calendar, respecting preferences like "no mornings" and travel buffers

## Specific Prompt(s)

```
claude /mail
claude /today
claude /schedule-reply "Reply to Sarah about next week's board meeting"
```
