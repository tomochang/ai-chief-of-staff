const path = require("path");
const fs = require("fs");
const os = require("os");

// We'll require the module under test
const {
  recordApproval,
  getApprovalStatus,
  getApprovalStats,
  parseJsonl,
} = require("../../scripts/approval");

// Each test gets its own temp JSONL file
let tmpDir;
let jsonlPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "approval-test-"));
  jsonlPath = path.join(tmpDir, "approvals.jsonl");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================
// recordApproval
// ============================================================
describe("recordApproval", () => {
  it("appends a valid JSONL line with id, action, timestamp, and metadata", () => {
    recordApproval("email:abc123", "send", { editDistance: 0 }, jsonlPath);
    const lines = parseJsonl(jsonlPath);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe("email:abc123");
    expect(lines[0].action).toBe("send");
    expect(lines[0].timestamp).toBeDefined();
    expect(lines[0].editDistance).toBe(0);
  });

  it("creates file if it doesn't exist", () => {
    const newPath = path.join(tmpDir, "subdir", "new.jsonl");
    recordApproval("slack:xyz", "skip", {}, newPath);
    expect(fs.existsSync(newPath)).toBe(true);
    const lines = parseJsonl(newPath);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe("slack:xyz");
  });

  it("captures editDistance field for edit actions", () => {
    recordApproval("email:e1", "edit", { editDistance: 42, editedText: "new text" }, jsonlPath);
    const lines = parseJsonl(jsonlPath);
    expect(lines[0].action).toBe("edit");
    expect(lines[0].editDistance).toBe(42);
    expect(lines[0].editedText).toBe("new text");
  });

  it("appends multiple entries", () => {
    recordApproval("email:a", "send", {}, jsonlPath);
    recordApproval("email:b", "skip", { reason: "not relevant" }, jsonlPath);
    const lines = parseJsonl(jsonlPath);
    expect(lines).toHaveLength(2);
    expect(lines[0].id).toBe("email:a");
    expect(lines[1].id).toBe("email:b");
    expect(lines[1].reason).toBe("not relevant");
  });
});

// ============================================================
// getApprovalStatus
// ============================================================
describe("getApprovalStatus", () => {
  it("returns latest action for a given id", () => {
    recordApproval("email:a", "pending", {}, jsonlPath);
    recordApproval("email:a", "send", {}, jsonlPath);
    const status = getApprovalStatus("email:a", jsonlPath);
    expect(status.action).toBe("send");
  });

  it("returns null for unknown id", () => {
    recordApproval("email:a", "send", {}, jsonlPath);
    const status = getApprovalStatus("email:unknown", jsonlPath);
    expect(status).toBeNull();
  });

  it("returns null for nonexistent file", () => {
    const status = getApprovalStatus("email:a", path.join(tmpDir, "nope.jsonl"));
    expect(status).toBeNull();
  });

  it("multiple approvals for same id: latest action wins (ordered by timestamp)", () => {
    recordApproval("slack:s1", "pending", {}, jsonlPath);
    recordApproval("slack:s1", "edit", { editDistance: 10 }, jsonlPath);
    recordApproval("slack:s1", "send", {}, jsonlPath);
    const status = getApprovalStatus("slack:s1", jsonlPath);
    expect(status.action).toBe("send");
  });
});

// ============================================================
// getApprovalStats
// ============================================================
describe("getApprovalStats", () => {
  it("computes correct sent/edited/skipped counts and avgEditDistance", () => {
    recordApproval("email:a", "send", {}, jsonlPath);
    recordApproval("email:b", "edit", { editDistance: 10 }, jsonlPath);
    recordApproval("email:c", "edit", { editDistance: 20 }, jsonlPath);
    recordApproval("email:d", "skip", {}, jsonlPath);

    const stats = getApprovalStats({}, jsonlPath);
    expect(stats.sent).toBe(1);
    expect(stats.edited).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.avgEditDistance).toBe(15);
  });

  it("filters by date range (from/to)", () => {
    // Write entries with explicit timestamps
    fs.writeFileSync(jsonlPath, [
      JSON.stringify({ id: "a", action: "send", timestamp: "2026-03-01T10:00:00Z" }),
      JSON.stringify({ id: "b", action: "edit", timestamp: "2026-03-03T10:00:00Z", editDistance: 5 }),
      JSON.stringify({ id: "c", action: "skip", timestamp: "2026-03-05T10:00:00Z" }),
    ].join("\n") + "\n");

    const stats = getApprovalStats({ from: "2026-03-02", to: "2026-03-04" }, jsonlPath);
    expect(stats.sent).toBe(0);
    expect(stats.edited).toBe(1);
    expect(stats.skipped).toBe(0);
    expect(stats.avgEditDistance).toBe(5);
  });

  it("returns zeroes for empty file or no matches", () => {
    fs.writeFileSync(jsonlPath, "");
    const stats = getApprovalStats({}, jsonlPath);
    expect(stats.sent).toBe(0);
    expect(stats.edited).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.avgEditDistance).toBe(0);
  });

  it("returns zeroes for nonexistent file", () => {
    const stats = getApprovalStats({}, path.join(tmpDir, "nope.jsonl"));
    expect(stats.sent).toBe(0);
    expect(stats.edited).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.avgEditDistance).toBe(0);
  });
});

// ============================================================
// parseJsonl edge cases
// ============================================================
describe("parseJsonl", () => {
  it("handles empty file gracefully", () => {
    fs.writeFileSync(jsonlPath, "");
    const lines = parseJsonl(jsonlPath);
    expect(lines).toEqual([]);
  });

  it("skips malformed lines with warning", () => {
    fs.writeFileSync(
      jsonlPath,
      '{"id":"a","action":"send","timestamp":"2026-03-01T00:00:00Z"}\nNOT_JSON\n{"id":"b","action":"skip","timestamp":"2026-03-01T00:00:00Z"}\n'
    );
    // Should not throw, should return 2 valid entries
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lines = parseJsonl(jsonlPath);
    expect(lines).toHaveLength(2);
    expect(lines[0].id).toBe("a");
    expect(lines[1].id).toBe("b");
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("returns empty array for nonexistent file", () => {
    const lines = parseJsonl(path.join(tmpDir, "nope.jsonl"));
    expect(lines).toEqual([]);
  });
});

// ============================================================
// CLI integration
// ============================================================
describe("CLI", () => {
  const { execFileSync } = require("child_process");
  const approvalScript = path.resolve(__dirname, "../../scripts/approval.js");

  it("'record' subcommand appends correctly", () => {
    execFileSync("node", [approvalScript, "record", "email:cli1", "send", "--file", jsonlPath]);
    const lines = parseJsonl(jsonlPath);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe("email:cli1");
    expect(lines[0].action).toBe("send");
  });

  it("'record' with edit metadata", () => {
    execFileSync("node", [
      approvalScript, "record", "email:cli2", "edit",
      "--editDistance", "15",
      "--editedText", "modified reply",
      "--file", jsonlPath,
    ]);
    const lines = parseJsonl(jsonlPath);
    expect(lines[0].editDistance).toBe(15);
    expect(lines[0].editedText).toBe("modified reply");
  });

  it("'status' subcommand returns latest action", () => {
    execFileSync("node", [approvalScript, "record", "email:cli3", "pending", "--file", jsonlPath]);
    execFileSync("node", [approvalScript, "record", "email:cli3", "send", "--file", jsonlPath]);
    const output = execFileSync("node", [approvalScript, "status", "email:cli3", "--file", jsonlPath], { encoding: "utf-8" });
    const result = JSON.parse(output.trim());
    expect(result.action).toBe("send");
  });

  it("'stats' subcommand returns counts", () => {
    execFileSync("node", [approvalScript, "record", "email:s1", "send", "--file", jsonlPath]);
    execFileSync("node", [approvalScript, "record", "email:s2", "edit", "--editDistance", "5", "--file", jsonlPath]);
    execFileSync("node", [approvalScript, "record", "email:s3", "skip", "--file", jsonlPath]);
    const output = execFileSync("node", [approvalScript, "stats", "--file", jsonlPath], { encoding: "utf-8" });
    const result = JSON.parse(output.trim());
    expect(result.sent).toBe(1);
    expect(result.edited).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.avgEditDistance).toBe(5);
  });
});
