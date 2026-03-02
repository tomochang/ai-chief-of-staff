import { describe, it, expect } from "vitest";
import {
  parseArgs,
  computeMetrics,
  renderTextReport,
} from "../../scripts/evaluate-triage.js";

describe("parseArgs", () => {
  it("parses required --file", () => {
    const opts = parseArgs(["--file", "data.jsonl"]);
    expect(opts.file).toBe("data.jsonl");
    expect(opts.positiveLabel).toBe("action_required");
  });

  it("throws when --file is missing", () => {
    expect(() => parseArgs([])).toThrow("Missing --file");
  });

  it("throws when threshold is used without score-field", () => {
    expect(() => parseArgs(["--file", "x.jsonl", "--threshold", "0.7"])).toThrow(
      "--threshold requires --score-field",
    );
  });
});

describe("computeMetrics", () => {
  it("computes label-mode metrics", () => {
    const rows = [
      { id: "1", gold: "action_required", pred: "action_required", text: "ask" },
      { id: "2", gold: "action_required", pred: "info_only", text: "question" },
      { id: "3", gold: "info_only", pred: "action_required", text: "fyi" },
      { id: "4", gold: "info_only", pred: "info_only", text: "report" },
    ];
    const opts = parseArgs(["--file", "x.jsonl"]);
    const result = computeMetrics(rows, opts);
    expect(result.summary.tp).toBe(1);
    expect(result.summary.fp).toBe(1);
    expect(result.summary.fn).toBe(1);
    expect(result.summary.tn).toBe(1);
    expect(result.summary.recall).toBe(0.5);
    expect(result.summary.missRate).toBe(0.5);
    expect(result.falseNegativeExamples[0].id).toBe("2");
  });

  it("computes threshold-mode metrics from score", () => {
    const rows = [
      { id: "1", gold: "action_required", score: 0.9, text: "need reply" },
      { id: "2", gold: "action_required", score: 0.4, text: "urgent ask" },
      { id: "3", gold: "info_only", score: 0.8, text: "newsletter" },
      { id: "4", gold: "info_only", score: 0.1, text: "cc" },
    ];
    const opts = parseArgs([
      "--file",
      "x.jsonl",
      "--score-field",
      "score",
      "--threshold",
      "0.5",
    ]);
    const result = computeMetrics(rows, opts);
    expect(result.summary.tp).toBe(1);
    expect(result.summary.fp).toBe(1);
    expect(result.summary.fn).toBe(1);
    expect(result.summary.tn).toBe(1);
  });
});

describe("renderTextReport", () => {
  it("includes recall and miss rate", () => {
    const rows = [
      { id: "1", gold: "action_required", pred: "info_only", text: "Need approval" },
    ];
    const opts = parseArgs(["--file", "x.jsonl"]);
    const result = computeMetrics(rows, opts);
    const report = renderTextReport(result, opts);
    expect(report).toContain("Recall (critical)");
    expect(report).toContain("Miss rate (FN rate)");
    expect(report).toContain("1: pred=info_only");
  });
});
