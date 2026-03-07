# CDP Send Checklist (Mandatory)

When sending messages via Chrome CDP (Messenger, etc.), **always use the send script**. Never press Enter directly via CDP.

## Required Send Flow

```
1. node messenger-send-cdp.js --thread <ID> --message "<text>" --dry-run
   -> Types text + saves screenshot to /tmp/messenger-pre-send.png
   |
2. Read /tmp/messenger-pre-send.png to visually verify
   |
3. Present screenshot to user -> get explicit approval
   |
4. node messenger-send-cdp.js --confirm-send
   -> Verifies textbox has content, then sends
```

## Prohibited Actions

- **Do NOT press Enter directly via CDP.** Always use the send script
- **Do NOT skip --dry-run.** Screenshot confirmation is mandatory before sending
- **Do NOT run --confirm-send without user approval**

## Why

- **CDP sends are irrevocable.** Unlike email, there is no undo/unsend
- The --dry-run + screenshot flow provides a visual confirmation checkpoint
- The --confirm-send safety check (textbox must not be empty) prevents accidental blank sends
- Evidence screenshots are saved automatically for audit trail
