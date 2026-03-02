# E2 Only: Action-Required Miss Rate Evaluation

This protocol validates only one thing:

- Can the system avoid missing `action_required` items?

## Why this metric first

For communication triage, false negatives are the highest-cost error:

- missing a direct ask
- missing a time-sensitive reply
- missing an explicit decision request

So we optimize for:

- **Recall(action_required)** (higher is better)
- **Miss rate(FN)** (lower is better)

## 3-day minimal protocol

1. Collect real triage outputs for 3 days (all active channels).
2. Human-label each message with `gold` (`action_required` or not).
3. Save as JSONL.
4. Evaluate with the script below.

## Data format (JSONL)

One line per message:

```json
{"id":"m-001","channel":"email","gold":"action_required","pred":"info_only","score":0.42,"text":"..."}
```

Required fields:

- `id`
- `gold`
- `pred` (or `score` if threshold mode is used)

Optional:

- `channel`
- `text`
- `score`

Sample file:

- `examples/metrics/triage-labeled.sample.jsonl`

## Commands

Label mode:

```bash
node scripts/evaluate-triage.js \
  --file examples/metrics/triage-labeled.sample.jsonl
```

Threshold mode (if your pipeline emits a score):

```bash
node scripts/evaluate-triage.js \
  --file examples/metrics/triage-labeled.sample.jsonl \
  --score-field score \
  --threshold 0.6
```

JSON output:

```bash
node scripts/evaluate-triage.js \
  --file examples/metrics/triage-labeled.sample.jsonl \
  --json
```

## Decision gates

Use these as initial gates:

- Go: Recall(action_required) >= 0.95 and Miss rate <= 0.05
- Iterate: Recall between 0.90 and 0.95
- Stop/rollback: Recall < 0.90

## Meta-cognitive loop (E2 only)

1. Measure FN examples.
2. Cluster FN by failure type:
   - implicit ask not detected
   - schedule intent not detected
   - short-message ambiguity
   - channel-specific wording miss
3. Add one minimal rule/prompt fix per largest cluster.
4. Re-run same evaluation.
5. Keep only changes that improve Recall without large FP explosion.
