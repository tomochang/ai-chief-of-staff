#!/usr/bin/env node
/**
 * calendar-suggest.js
 * Find free time slots from your calendar and generate scheduling candidates.
 *
 * Usage:
 *   node scripts/calendar-suggest.js                    # Next 7 days
 *   node scripts/calendar-suggest.js --days 14          # Next 14 days
 *   node scripts/calendar-suggest.js --from 2026-02-01 --to 2026-02-10
 *   node scripts/calendar-suggest.js --prefer-start 11  # Prefer 11:00+ slots
 *   node scripts/calendar-suggest.js --json             # JSON output
 *   node scripts/calendar-suggest.js --travel-buffer 60 # Add 60min buffer around events
 *
 * Prerequisites:
 *   - A calendar CLI tool that outputs JSON (this uses `gog calendar list`)
 *   - Adjust the fetchEvents() function if using a different tool
 */

const { execSync } = require("child_process");

// ============================================================
// CONFIGURATION — Edit these to match your preferences
// ============================================================
const CONFIG = {
  // Calendar to query (use "primary" or a specific calendar ID)
  calendarId: "primary",

  // Working hours (your timezone)
  workHours: {
    start: 10, // 10:00
    end: 18, // 18:00
  },

  // Minimum slot duration in minutes
  minSlotMinutes: 60,

  // Days to exclude (0=Sun, 6=Sat)
  excludeDays: [0, 6],

  // Default travel buffer in minutes (used with --travel-buffer flag)
  defaultTravelBuffer: 60,
};

// Day names — change to your locale
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Events matching these patterns are NOT treated as busy
// (e.g., focus time blocks, lunch reminders, placeholder events)
const BLOCK_EXCLUDE_PATTERNS = [
  /focus.?time/i,
  /lunch/i,
  /block/i,
  /placeholder/i,
  /🆓/, // Explicit "free" marker
];

// ============================================================
// IMPLEMENTATION
// ============================================================

function shouldExcludeEvent(summary) {
  if (!summary) return false;
  return BLOCK_EXCLUDE_PATTERNS.some((pat) => pat.test(summary));
}

function toLocalDateString(date) {
  // Adjust for your timezone offset (this example uses +9 for JST)
  const offset = 9 * 60 * 60 * 1000; // Change to your UTC offset in ms
  const local = new Date(date.getTime() + offset);
  return local.toISOString().slice(0, 10);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    days: 7,
    from: null,
    to: null,
    json: false,
    travelBuffer: 0,
    preferStart: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--days":
        result.days = parseInt(args[++i], 10);
        break;
      case "--from":
        result.from = args[++i];
        break;
      case "--to":
        result.to = args[++i];
        break;
      case "--json":
        result.json = true;
        break;
      case "--travel-buffer":
        result.travelBuffer = parseInt(args[++i], 10);
        break;
      case "--travel":
        result.travelBuffer = CONFIG.defaultTravelBuffer;
        break;
      case "--prefer-start":
        result.preferStart = parseInt(args[++i], 10);
        break;
    }
  }

  return result;
}

function getDateRange(args) {
  const now = new Date();
  let from, to;

  if (args.from && args.to) {
    from = new Date(args.from + "T00:00:00+09:00"); // Adjust timezone
    to = new Date(args.to + "T23:59:59+09:00");
  } else {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(to.getDate() + args.days);
  }

  return { from, to };
}

function fetchEvents(from, to) {
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  // ============================================================
  // ADAPT THIS to your calendar CLI tool
  // The command should return JSON with an "events" array,
  // where each event has:
  //   - start.dateTime or start.date
  //   - end.dateTime or end.date
  //   - summary (event title)
  // ============================================================
  const cmd = `gog calendar list ${CONFIG.calendarId} --from "${fromStr}" --to "${toStr}" --max 250 --json`;

  try {
    const output = execSync(cmd, { encoding: "utf-8" });
    return JSON.parse(output);
  } catch (err) {
    console.error("Error fetching events:", err.message);
    process.exit(1);
  }
}

function parseBusyTimes(data) {
  const busy = [];

  if (data.events) {
    for (const event of data.events) {
      if (shouldExcludeEvent(event.summary)) continue;

      const startStr = event.start?.dateTime || event.start?.date;
      const endStr = event.end?.dateTime || event.end?.date;
      if (!startStr || !endStr) continue;

      busy.push({
        start: new Date(startStr),
        end: new Date(endStr),
      });
    }
  }

  busy.sort((a, b) => a.start - b.start);
  return busy;
}

function findFreeSlots(from, to, busyTimes, travelBuffer = 0) {
  const slots = [];
  const current = new Date(from);

  while (current < to) {
    const dayOfWeek = current.getDay();

    if (CONFIG.excludeDays.includes(dayOfWeek)) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const dayStart = new Date(current);
    dayStart.setHours(CONFIG.workHours.start, 0, 0, 0);
    const dayEnd = new Date(current);
    dayEnd.setHours(CONFIG.workHours.end, 0, 0, 0);

    // If today, only show slots after current time
    const now = new Date();
    if (dayStart.toDateString() === now.toDateString() && dayStart < now) {
      dayStart.setTime(now.getTime());
      dayStart.setMinutes(Math.ceil(dayStart.getMinutes() / 30) * 30, 0, 0);
    }

    // Get busy times for this day
    const dayBusy = busyTimes
      .filter((b) => b.start < dayEnd && b.end > dayStart)
      .map((b) => ({
        start: new Date(
          b.start.getTime() - travelBuffer * 60 * 1000,
        ),
        end: new Date(b.end.getTime() + travelBuffer * 60 * 1000),
      }));

    // Calculate free slots
    let pointer = new Date(dayStart);

    for (const b of dayBusy) {
      if (b.start > pointer) {
        const slotEnd = new Date(
          Math.min(b.start.getTime(), dayEnd.getTime()),
        );
        const durationMin = (slotEnd - pointer) / 60000;

        if (durationMin >= CONFIG.minSlotMinutes) {
          slots.push({
            date: new Date(current),
            start: new Date(pointer),
            end: slotEnd,
            durationMin,
          });
        }
      }
      pointer = new Date(Math.max(pointer.getTime(), b.end.getTime()));
    }

    // Free time after last busy slot
    if (pointer < dayEnd) {
      const durationMin = (dayEnd - pointer) / 60000;
      if (durationMin >= CONFIG.minSlotMinutes) {
        slots.push({
          date: new Date(current),
          start: new Date(pointer),
          end: new Date(dayEnd),
          durationMin,
        });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function formatDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = DAY_NAMES[date.getDay()];
  return `${month}/${day} (${dow})`;
}

function sortSlotsByPreference(slots, preferStart) {
  if (preferStart == null) return slots;

  const preferred = [];
  const early = [];

  for (const s of slots) {
    if (s.start.getHours() >= preferStart) {
      preferred.push(s);
    } else {
      early.push(s);
    }
  }

  return [...preferred, ...early];
}

function formatSlotsForEmail(slots, preferStart) {
  const byDate = {};
  for (const s of slots) {
    const key = toLocalDateString(s.date);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(s);
  }

  const lines = [];
  lines.push("Available times:");

  for (const [dateKey, daySlots] of Object.entries(byDate)) {
    const dateStr = formatDate(daySlots[0].date);
    const timeRanges = daySlots.map((s) => {
      const label = `${formatTime(s.start)}-${formatTime(s.end)}`;
      if (preferStart != null && s.start.getHours() < preferStart) {
        return `${label} (early)`;
      }
      return label;
    });
    lines.push(`- ${dateStr}: ${timeRanges.join(" / ")}`);
  }

  lines.push("");
  lines.push(
    "Let me know what works for you. Happy to adjust if none of these fit.",
  );

  return lines.join("\n");
}

function formatSlotsCompact(slots) {
  const unique = [];
  const seen = new Set();

  for (const s of slots) {
    const key = toLocalDateString(s.date);
    if (!seen.has(key) && unique.length < 3) {
      seen.add(key);
      unique.push(s);
    }
  }

  return unique
    .map((s) => `${formatDate(s.date)} ${formatTime(s.start)}+`)
    .join(", ");
}

async function main() {
  const args = parseArgs();
  const { from, to } = getDateRange(args);

  console.error(
    `Searching for free slots: ${from.toLocaleDateString()} - ${to.toLocaleDateString()}...`,
  );

  const data = fetchEvents(from, to);
  const busyTimes = parseBusyTimes(data);
  const rawSlots = findFreeSlots(from, to, busyTimes, args.travelBuffer);
  const slots = sortSlotsByPreference(rawSlots, args.preferStart);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          range: { from: from.toISOString(), to: to.toISOString() },
          preferStart: args.preferStart,
          slots: slots.map((s) => ({
            date: toLocalDateString(s.date),
            start: formatTime(s.start),
            end: formatTime(s.end),
            durationMin: s.durationMin,
            preferred:
              args.preferStart == null ||
              s.start.getHours() >= args.preferStart,
          })),
          formatted: formatSlotsForEmail(slots, args.preferStart),
          compact: formatSlotsCompact(slots),
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\n" + formatSlotsForEmail(slots, args.preferStart));
    console.log("\n---\nCompact: " + formatSlotsCompact(slots));
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseArgs, getDateRange, parseBusyTimes, findFreeSlots,
  sortSlotsByPreference, formatSlotsForEmail, formatSlotsCompact,
  formatTime, formatDate, shouldExcludeEvent, toLocalDateString, CONFIG,
};
