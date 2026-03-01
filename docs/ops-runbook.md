# Operations Runbook

This runbook covers the common operational failures for this repository and their recovery steps.

## 1) `npm test` fails in CI/local

- Symptom:
  - JS/Bash/E2E tests fail in `npm test`
- Checks:
  - `node -v` (must be 18+)
  - `jq --version`
  - `bats --version`
  - `npm ci`
- Recovery:
  - Reinstall dependencies: `npm ci`
  - Run each suite separately to isolate:
    - `npm run test:js`
    - `npm run test:bash`
    - `npm run test:e2e`
  - Fix failing test or fixture, then rerun full `npm test`
- Prevention:
  - Keep tests deterministic (no external network calls)
  - Update fixtures together with behavior changes

## 2) Messenger send script fails with `playwright` missing

- Symptom:
  - `ERROR: playwright is not installed. Run: npm install playwright`
- Checks:
  - `node -e "require.resolve('playwright')"` exits 0?
- Recovery:
  - Install: `npm install playwright`
  - Verify script parse path: `node scripts/messenger-send-cdp.js --to test --message test --dry-run`
- Prevention:
  - Keep `playwright` as an explicit local dependency for environments that send Messenger messages

## 3) Messenger CDP connection fails

- Symptom:
  - Script cannot connect to `127.0.0.1:9222`
- Checks:
  - `lsof -i :9222`
  - Chrome launched with `--remote-debugging-port=9222`
  - Logged-in profile is attached to that Chrome instance
- Recovery:
  - Restart Chrome with CDP flag
  - Retry with explicit port: `--port 9222`
  - Run `scripts/messenger-check-cdp.js` first to verify thread visibility
- Prevention:
  - Use a dedicated browser profile for automation
  - Keep CDP port and profile startup command scripted

## 4) Scheduling output looks wrong

- Symptom:
  - `calendar-suggest.js` returns empty/odd slots
- Checks:
  - `gog calendar list ... --json` returns parseable JSON
  - timezone assumptions (+09:00) match your environment
  - exclusions in `BLOCK_EXCLUDE_PATTERNS` are not too broad
- Recovery:
  - Validate calendar CLI output manually
  - Run debug range:
    - `node scripts/calendar-suggest.js --from 2026-03-02 --to 2026-03-09 --json`
  - Adjust config/exclusion patterns and rerun tests
- Prevention:
  - Add/modify tests in `tests/js/calendar-suggest.test.js` whenever slot logic changes

## 5) Quick health check before shipping

Run this exact sequence:

```bash
npm ci
npm test
```

If both pass, the repository is in a releasable baseline state.
