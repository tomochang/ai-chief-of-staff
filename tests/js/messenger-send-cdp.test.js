import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock playwright before importing the module under test.
// messenger-send-cdp.js does `require("playwright")` at the top level,
// which would fail since playwright is not installed in test deps.
vi.mock("playwright", () => ({
  chromium: { connectOverCDP: vi.fn() },
}));

const { parseArgs } = await import("../../scripts/messenger-send-cdp.js");

// ============================================================
// parseArgs
// ============================================================
describe("parseArgs", () => {
  let originalArgv;

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("parses --to and --message", () => {
    process.argv = ["node", "script.js", "--to", "Name", "--message", "Hello"];
    const opts = parseArgs();
    expect(opts.to).toBe("Name");
    expect(opts.message).toBe("Hello");
  });

  it("parses --thread with --e2ee", () => {
    process.argv = [
      "node",
      "script.js",
      "--thread",
      "123456",
      "--e2ee",
      "--message",
      "Hi",
    ];
    const opts = parseArgs();
    expect(opts.thread).toBe("123456");
    expect(opts.e2ee).toBe(true);
  });

  it("parses --dry-run flag", () => {
    process.argv = [
      "node",
      "script.js",
      "--to",
      "Someone",
      "--message",
      "Test",
      "--dry-run",
    ];
    const opts = parseArgs();
    expect(opts.dryRun).toBe(true);
  });

  it("parses --port and --timeout as integers", () => {
    process.argv = [
      "node",
      "script.js",
      "--to",
      "Someone",
      "--message",
      "Test",
      "--port",
      "9333",
      "--timeout",
      "5000",
    ];
    const opts = parseArgs();
    expect(opts.port).toBe(9333);
    expect(opts.timeout).toBe(5000);
  });

  it("uses correct defaults when only required args are given", () => {
    process.argv = [
      "node",
      "script.js",
      "--to",
      "Someone",
      "--message",
      "Hello",
    ];
    const opts = parseArgs();
    expect(opts.port).toBe(9222);
    expect(opts.timeout).toBe(10000);
    expect(opts.dryRun).toBe(false);
    expect(opts.e2ee).toBe(false);
    expect(opts.debug).toBe(false);
    expect(opts.thread).toBeNull();
  });

  it("exits when --message is missing", () => {
    process.argv = ["node", "script.js", "--to", "Someone"];

    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs()).toThrow("exit");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("exits when neither --to nor --thread is provided", () => {
    process.argv = ["node", "script.js", "--message", "Hello"];

    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs()).toThrow("exit");
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
