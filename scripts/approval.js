#!/usr/bin/env node
/**
 * approval.js — Git-backed JSONL approval tracking
 *
 * Stores approval decisions as append-only JSONL in drafts/approvals.jsonl.
 * Slack reactions remain the UI; this file is the source of truth.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_JSONL = path.resolve(__dirname, "..", "drafts", "approvals.jsonl");

// ============================================================
// JSONL utilities
// ============================================================

/**
 * Parse a JSONL file into an array of objects.
 * Returns [] for nonexistent or empty files.
 * Skips malformed lines with a console.warn.
 */
function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      results.push(JSON.parse(lines[i]));
    } catch (err) {
      console.warn(`[approval] Skipping malformed JSONL at line ${i + 1}: ${err.message}`);
    }
  }
  return results;
}

/**
 * Append a single JSON object as a JSONL line.
 * Creates parent directories and file if needed.
 */
function appendJsonl(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(obj) + "\n");
}

// ============================================================
// Core functions
// ============================================================

/**
 * Record an approval decision.
 * @param {string} id - Canonical message ID (e.g. "email:abc123")
 * @param {string} action - One of: pending, send, edit, skip, timed_out
 * @param {object} metadata - Optional fields: editDistance, editedText, reason
 * @param {string} [filePath] - JSONL file path (defaults to drafts/approvals.jsonl)
 */
function recordApproval(id, action, metadata = {}, filePath = DEFAULT_JSONL) {
  const entry = {
    id,
    action,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  appendJsonl(filePath, entry);
}

/**
 * Get the latest approval status for a given message ID.
 * @param {string} id
 * @param {string} [filePath]
 * @returns {object|null} Latest entry or null if not found
 */
function getApprovalStatus(id, filePath = DEFAULT_JSONL) {
  const entries = parseJsonl(filePath);
  let latest = null;
  for (const entry of entries) {
    if (entry.id === id) latest = entry;
  }
  return latest;
}

/**
 * Compute approval statistics, optionally filtered by date range.
 * @param {object} opts - { from?: string, to?: string } ISO date strings
 * @param {string} [filePath]
 * @returns {{ sent: number, edited: number, skipped: number, avgEditDistance: number }}
 */
function getApprovalStats(opts = {}, filePath = DEFAULT_JSONL) {
  const entries = parseJsonl(filePath);
  const fromDate = opts.from ? new Date(opts.from) : null;
  const toDate = opts.to ? new Date(opts.to + "T23:59:59.999Z") : null;

  let sent = 0;
  let edited = 0;
  let skipped = 0;
  let totalEditDist = 0;
  let editCount = 0;

  for (const entry of entries) {
    if (entry.action === "pending") continue;

    if (fromDate || toDate) {
      const ts = new Date(entry.timestamp);
      if (fromDate && ts < fromDate) continue;
      if (toDate && ts > toDate) continue;
    }

    switch (entry.action) {
      case "send":
        sent++;
        break;
      case "edit":
        edited++;
        if (typeof entry.editDistance === "number") {
          totalEditDist += entry.editDistance;
          editCount++;
        }
        break;
      case "skip":
        skipped++;
        break;
    }
  }

  return {
    sent,
    edited,
    skipped,
    avgEditDistance: editCount > 0 ? totalEditDist / editCount : 0,
  };
}

// ============================================================
// CLI
// ============================================================

function parseCliArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1];
      args[key] = val;
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, args };
}

function cli(argv) {
  const { positional, args } = parseCliArgs(argv);
  const command = positional[0];
  const filePath = args.file || DEFAULT_JSONL;

  switch (command) {
    case "record": {
      const id = positional[1];
      const action = positional[2];
      if (!id || !action) {
        console.error("Usage: approval.js record <id> <action> [--editDistance N] [--editedText '...'] [--reason '...'] [--file path]");
        process.exit(1);
      }
      const metadata = {};
      if (args.editDistance) metadata.editDistance = Number(args.editDistance);
      if (args.editedText) metadata.editedText = args.editedText;
      if (args.reason) metadata.reason = args.reason;
      recordApproval(id, action, metadata, filePath);
      break;
    }
    case "status": {
      const id = positional[1];
      if (!id) {
        console.error("Usage: approval.js status <id> [--file path]");
        process.exit(1);
      }
      const status = getApprovalStatus(id, filePath);
      console.log(JSON.stringify(status));
      break;
    }
    case "stats": {
      const opts = {};
      if (args.from) opts.from = args.from;
      if (args.to) opts.to = args.to;
      const stats = getApprovalStats(opts, filePath);
      console.log(JSON.stringify(stats));
      break;
    }
    default:
      console.error("Usage: approval.js <record|status|stats> [args]");
      process.exit(1);
  }
}

// Run CLI if invoked directly
if (require.main === module) {
  cli(process.argv.slice(2));
}

module.exports = { recordApproval, getApprovalStatus, getApprovalStats, parseJsonl };
