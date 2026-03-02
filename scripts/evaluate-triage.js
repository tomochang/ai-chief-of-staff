#!/usr/bin/env node
/**
 * evaluate-triage.js
 *
 * E2 evaluation utility focused on action_required miss rate (false negatives).
 *
 * Input format: JSONL, one object per line.
 * Example line:
 * {"id":"m-001","gold":"action_required","pred":"info_only","score":0.42,"text":"..."}
 *
 * Usage:
 *   node scripts/evaluate-triage.js --file ./data/triage-labeled.jsonl
 *   node scripts/evaluate-triage.js --file ./data/triage-labeled.jsonl --threshold 0.6 --score-field score
 *   node scripts/evaluate-triage.js --file ./data/triage-labeled.jsonl --json
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    file: null,
    goldField: "gold",
    predField: "pred",
    scoreField: null,
    threshold: null,
    positiveLabel: "action_required",
    json: false,
    maxExamples: 20,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
        opts.file = argv[++i];
        break;
      case "--gold-field":
        opts.goldField = argv[++i];
        break;
      case "--pred-field":
        opts.predField = argv[++i];
        break;
      case "--score-field":
        opts.scoreField = argv[++i];
        break;
      case "--threshold":
        opts.threshold = parseFloat(argv[++i]);
        break;
      case "--positive-label":
        opts.positiveLabel = argv[++i];
        break;
      case "--max-examples":
        opts.maxExamples = parseInt(argv[++i], 10);
        break;
      case "--json":
        opts.json = true;
        break;
    }
  }

  if (!opts.file) {
    throw new Error("Missing --file");
  }
  if (opts.threshold != null && opts.scoreField == null) {
    throw new Error("--threshold requires --score-field");
  }

  return opts;
}

function parseJsonl(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, "utf-8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${err.message}`);
    }
  });
}

function resolvePred(row, opts) {
  if (opts.threshold != null) {
    const score = Number(row[opts.scoreField]);
    if (!Number.isFinite(score)) {
      return null;
    }
    return score >= opts.threshold ? opts.positiveLabel : "__negative__";
  }
  return row[opts.predField];
}

function computeMetrics(rows, opts) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let skipped = 0;
  const fnExamples = [];
  const fpExamples = [];

  for (const row of rows) {
    const gold = row[opts.goldField];
    const pred = resolvePred(row, opts);

    if (gold == null || pred == null) {
      skipped += 1;
      continue;
    }

    const isPositiveGold = gold === opts.positiveLabel;
    const isPositivePred = pred === opts.positiveLabel;

    if (isPositiveGold && isPositivePred) tp += 1;
    else if (!isPositiveGold && isPositivePred) fp += 1;
    else if (isPositiveGold && !isPositivePred) {
      fn += 1;
      if (fnExamples.length < opts.maxExamples) {
        fnExamples.push({
          id: row.id ?? null,
          gold,
          pred,
          text: row.text ?? null,
          score: opts.scoreField ? row[opts.scoreField] : null,
        });
      }
    } else tn += 1;

    if (!isPositiveGold && isPositivePred && fpExamples.length < opts.maxExamples) {
      fpExamples.push({
        id: row.id ?? null,
        gold,
        pred,
        text: row.text ?? null,
        score: opts.scoreField ? row[opts.scoreField] : null,
      });
    }
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const missRate = tp + fn === 0 ? 0 : fn / (tp + fn);

  return {
    summary: {
      total: rows.length,
      evaluated: rows.length - skipped,
      skipped,
      tp,
      fp,
      fn,
      tn,
      precision,
      recall,
      f1,
      missRate,
    },
    falseNegativeExamples: fnExamples,
    falsePositiveExamples: fpExamples,
  };
}

function formatPct(v) {
  return `${(v * 100).toFixed(2)}%`;
}

function renderTextReport(result, opts) {
  const s = result.summary;
  const lines = [];
  lines.push("Triage Evaluation (E2)");
  lines.push(`Positive label: ${opts.positiveLabel}`);
  if (opts.threshold != null) {
    lines.push(`Threshold mode: score field '${opts.scoreField}' >= ${opts.threshold}`);
  } else {
    lines.push(`Label mode: pred field '${opts.predField}'`);
  }
  lines.push("");
  lines.push(`Rows: ${s.total} (evaluated=${s.evaluated}, skipped=${s.skipped})`);
  lines.push(`Confusion: TP=${s.tp}, FP=${s.fp}, FN=${s.fn}, TN=${s.tn}`);
  lines.push(`Recall (critical): ${formatPct(s.recall)}`);
  lines.push(`Miss rate (FN rate): ${formatPct(s.missRate)}`);
  lines.push(`Precision: ${formatPct(s.precision)}`);
  lines.push(`F1: ${formatPct(s.f1)}`);
  lines.push("");
  lines.push("Top false negatives (action_required missed):");

  if (result.falseNegativeExamples.length === 0) {
    lines.push("- none");
  } else {
    for (const ex of result.falseNegativeExamples) {
      const id = ex.id ?? "(no-id)";
      const scoreSuffix = ex.score == null ? "" : ` score=${ex.score}`;
      const snippet = ex.text ? ` | ${String(ex.text).slice(0, 120)}` : "";
      lines.push(`- ${id}: pred=${ex.pred}${scoreSuffix}${snippet}`);
    }
  }

  return lines.join("\n");
}

function main() {
  try {
    const opts = parseArgs();
    const rows = parseJsonl(opts.file);
    const result = computeMetrics(rows, opts);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderTextReport(result, opts));
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, parseJsonl, computeMetrics, renderTextReport };
