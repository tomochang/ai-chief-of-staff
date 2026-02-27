# Messenger E2EE: Automated Send Investigation

**Date**: 2026-02-27

## Problem

Messenger's End-to-End Encrypted (E2EE) chats cannot be automated with standard browser automation techniques. The `contenteditable` textbox is React-managed, and most DOM manipulation methods fail silently.

## Methods Tested

| # | Method | Works with E2EE? | Notes |
|---|--------|:-:|-------|
| 1 | Matrix bridge API | N/A | Requires bridge setup. Separate from browser automation. |
| 2 | Chrome AppleScript + `execCommand` | **No** | `execCommand('insertText')` is ignored by React |
| 3 | Playwright `fill()` | **No** | Same React issue — DOM changes don't update React state |
| 4 | `dispatchEvent(InputEvent)` | **No** | React synthetic events don't pick up dispatched DOM events |
| 5 | `element.innerText = ...` | **No** | Direct DOM mutation, React doesn't see it |
| 6 | Playwright `keyboard.type()` via CDP | **Yes** | OS-level input events that React correctly handles |

## Solution: CDP + keyboard.type()

```
headless Chrome (port 9222) ← Playwright connectOverCDP ← keyboard.type()
```

### Key Technical Details

1. **Connect to existing Chrome** via CDP (don't launch a new browser)
2. **Dismiss overlays** — Messenger shows dialogs (PIN recovery, E2E notices) that block interaction
   - Press Escape
   - Remove `[role="dialog"]` elements
   - Hide `position:fixed` + high `z-index` overlays (preserve textbox containers)
3. **Force-click textbox** — `{ force: true }` bypasses overlay pointer-event interception
4. **Type with keyboard.type()** — sends OS-level key events that React's event system captures
5. **Newlines**: `Shift+Enter` (plain `Enter` sends the message)
   ```javascript
   await page.keyboard.down('Shift');
   await page.keyboard.press('Enter');
   await page.keyboard.up('Shift');
   ```
6. **Verify before sending** — check `textbox.innerText` to confirm text was actually entered

### Why keyboard.type() Works

React uses a synthetic event system that listens for native browser events. When you:
- Mutate the DOM directly (`execCommand`, `innerText = ...`) → React's virtual DOM is out of sync, state doesn't update
- Dispatch synthetic DOM events → React doesn't trust them (different event origin)
- Send OS-level keyboard input → browser generates native `input`/`keydown`/`keyup` events → React catches these normally

## Chrome Environment

The system uses a **headless Chrome instance** separate from the user's normal Chrome:

```
Normal Chrome (GUI)     ← user's daily browser, no debug port
Headless Chrome (9222)  ← automation target, --user-data-dir=/tmp/chrome-profile
```

- Profile is copied from the user's Chrome (cookies, login data) so Messenger login persists
- Both processes coexist without conflict
- AppleScript cannot control headless Chrome (no GUI windows)

## Scripts

| Script | Purpose |
|--------|---------|
| `messenger-send-cdp.js` | Node.js CDP send script (the solution) |
| `messenger-send.sh --cdp` | Shell wrapper with approval check + status update |
| `messenger-send.sh --chrome` | Legacy AppleScript mode (does NOT work with E2EE) |

## Usage

```bash
# Recommended: CDP mode with thread ID
messenger-send.sh "相手名" "メッセージ" --cdp --thread THREAD_ID

# CDP mode with search
messenger-send.sh "相手名" "メッセージ" --cdp

# Dry run (type but don't send)
messenger-send.sh "相手名" "メッセージ" --cdp --dry-run

# Multi-line message
node messenger-send-cdp.js --thread THREAD_ID --message "1行目\n2行目\n3行目"
```
