# Files to Read at Session Start

At the start of every session (before processing the first message), **actually read** the following files. Not "reference" -- open them with the Read tool and review their contents:

1. **`SHARED_RULES.md`** -- Shared rules for schedule/relationship auto-updates, todo routing, etc.
2. **`private/INDEX.md`** -- File structure under private/ and linked update rules
3. **`SOUL.md`** -- Behavioral rules (formality, tone, external persona settings)
4. **`IDENTITY.md`** -- Persona settings for replying externally on behalf of the user

**After reading, log the action:**

```bash
echo "$(date +%Y-%m-%d_%H:%M:%S) SESSION_START: read SHARED_RULES.md, private/INDEX.md, IDENTITY.md" >> $WORKSPACE/logs/session_reads.log
```

## When You Receive a Reminder from Hooks

If the context contains a `[MANDATORY_SESSION_PROTOCOL]` reminder, read the above files **before responding to the user**. No exceptions, even for casual messages like "hello" or "let's chat". Read the files, log it, then respond.

## Configuration

Replace the following placeholders with your actual values:

| Placeholder | Description |
|-------------|-------------|
| `$WORKSPACE` | Your workspace root directory (e.g., `~/workspace`) |
