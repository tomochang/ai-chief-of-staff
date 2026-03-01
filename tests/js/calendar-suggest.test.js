import { describe, it, expect } from "vitest";
import {
  shouldExcludeEvent,
  parseBusyTimes,
  findFreeSlots,
  sortSlotsByPreference,
  formatSlotsForEmail,
  formatSlotsCompact,
  formatTime,
  formatDate,
  toLocalDateString,
  CONFIG,
} from "../../scripts/calendar-suggest.js";

// Helper: create a Date with explicit local time (no timezone suffix = local)
function localDate(year, month, day, hour = 0, min = 0) {
  return new Date(year, month - 1, day, hour, min, 0, 0);
}

// Monday 2026-03-02 is a known weekday (future date, avoids "today" branch)
const MON = { year: 2026, month: 3, day: 2 };

// ============================================================
// shouldExcludeEvent
// ============================================================
describe("shouldExcludeEvent", () => {
  it("excludes 'Focus Time' (case insensitive, optional space)", () => {
    expect(shouldExcludeEvent("Focus Time")).toBe(true);
    expect(shouldExcludeEvent("focus time")).toBe(true);
    expect(shouldExcludeEvent("FocusTime")).toBe(true);
    expect(shouldExcludeEvent("FOCUS TIME")).toBe(true);
  });

  it("excludes 'Lunch' variants", () => {
    expect(shouldExcludeEvent("Lunch")).toBe(true);
    expect(shouldExcludeEvent("lunch break")).toBe(true);
    expect(shouldExcludeEvent("Team Lunch")).toBe(true);
  });

  it("excludes events with 🆓 emoji", () => {
    expect(shouldExcludeEvent("🆓 Free afternoon")).toBe(true);
    expect(shouldExcludeEvent("🆓")).toBe(true);
  });

  it("excludes 'block' and 'placeholder'", () => {
    expect(shouldExcludeEvent("Calendar Block")).toBe(true);
    expect(shouldExcludeEvent("Placeholder meeting")).toBe(true);
  });

  it("does NOT exclude normal meetings", () => {
    expect(shouldExcludeEvent("Team Standup")).toBe(false);
    expect(shouldExcludeEvent("1:1 with Manager")).toBe(false);
    expect(shouldExcludeEvent("Sprint Review")).toBe(false);
  });

  it("returns false for null/undefined summary", () => {
    expect(shouldExcludeEvent(null)).toBe(false);
    expect(shouldExcludeEvent(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(shouldExcludeEvent("")).toBe(false);
  });
});

// ============================================================
// parseBusyTimes
// ============================================================
describe("parseBusyTimes", () => {
  it("filters out excluded events (Focus Time, Lunch, 🆓)", () => {
    const data = {
      events: [
        {
          summary: "Focus Time",
          start: { dateTime: "2026-03-02T10:00:00+09:00" },
          end: { dateTime: "2026-03-02T11:00:00+09:00" },
        },
        {
          summary: "Lunch",
          start: { dateTime: "2026-03-02T12:00:00+09:00" },
          end: { dateTime: "2026-03-02T13:00:00+09:00" },
        },
        {
          summary: "🆓 Free block",
          start: { dateTime: "2026-03-02T14:00:00+09:00" },
          end: { dateTime: "2026-03-02T15:00:00+09:00" },
        },
        {
          summary: "Real Meeting",
          start: { dateTime: "2026-03-02T11:00:00+09:00" },
          end: { dateTime: "2026-03-02T12:00:00+09:00" },
        },
      ],
    };
    const busy = parseBusyTimes(data);
    expect(busy).toHaveLength(1);
    expect(busy[0].start.getTime()).toBe(
      new Date("2026-03-02T11:00:00+09:00").getTime(),
    );
  });

  it("handles dateTime events with timezone", () => {
    const data = {
      events: [
        {
          summary: "Meeting",
          start: { dateTime: "2026-03-02T14:00:00+09:00" },
          end: { dateTime: "2026-03-02T15:00:00+09:00" },
        },
      ],
    };
    const busy = parseBusyTimes(data);
    expect(busy).toHaveLength(1);
    expect(busy[0].start).toBeInstanceOf(Date);
    expect(busy[0].end).toBeInstanceOf(Date);
    // 1 hour duration
    expect(busy[0].end - busy[0].start).toBe(60 * 60 * 1000);
  });

  it("handles all-day events (date only, no dateTime)", () => {
    const data = {
      events: [
        {
          summary: "Company Holiday",
          start: { date: "2026-03-02" },
          end: { date: "2026-03-03" },
        },
      ],
    };
    const busy = parseBusyTimes(data);
    expect(busy).toHaveLength(1);
    // All-day events span midnight to midnight
    expect(busy[0].start).toBeInstanceOf(Date);
    expect(busy[0].end).toBeInstanceOf(Date);
  });

  it("returns sorted by start time", () => {
    const data = {
      events: [
        {
          summary: "Later",
          start: { dateTime: "2026-03-02T16:00:00+09:00" },
          end: { dateTime: "2026-03-02T17:00:00+09:00" },
        },
        {
          summary: "Earlier",
          start: { dateTime: "2026-03-02T10:00:00+09:00" },
          end: { dateTime: "2026-03-02T11:00:00+09:00" },
        },
        {
          summary: "Middle",
          start: { dateTime: "2026-03-02T13:00:00+09:00" },
          end: { dateTime: "2026-03-02T14:00:00+09:00" },
        },
      ],
    };
    const busy = parseBusyTimes(data);
    expect(busy[0].start < busy[1].start).toBe(true);
    expect(busy[1].start < busy[2].start).toBe(true);
  });

  it("skips events with missing start or end fields", () => {
    const data = {
      events: [
        { summary: "No start", end: { dateTime: "2026-03-02T11:00:00+09:00" } },
        { summary: "No end", start: { dateTime: "2026-03-02T10:00:00+09:00" } },
        { summary: "No start obj", start: null, end: { dateTime: "2026-03-02T11:00:00+09:00" } },
        {
          summary: "Valid",
          start: { dateTime: "2026-03-02T10:00:00+09:00" },
          end: { dateTime: "2026-03-02T11:00:00+09:00" },
        },
      ],
    };
    const busy = parseBusyTimes(data);
    expect(busy).toHaveLength(1);
    expect(busy[0].end - busy[0].start).toBe(60 * 60 * 1000);
  });

  it("returns empty array for empty events", () => {
    expect(parseBusyTimes({ events: [] })).toEqual([]);
  });

  it("returns empty array when data has no events key", () => {
    expect(parseBusyTimes({})).toEqual([]);
  });
});

// ============================================================
// findFreeSlots
// ============================================================
describe("findFreeSlots", () => {
  // Use a 1-day range: Monday 2026-03-02 00:00 to Tuesday 2026-03-03 00:00
  const dayFrom = localDate(MON.year, MON.month, MON.day);
  const dayTo = localDate(MON.year, MON.month, MON.day + 1);

  it("no busy times → returns full working day (480 min)", () => {
    const slots = findFreeSlots(dayFrom, dayTo, []);
    expect(slots).toHaveLength(1);
    expect(slots[0].durationMin).toBe(480); // 10:00-18:00
    expect(slots[0].start.getHours()).toBe(10);
    expect(slots[0].end.getHours()).toBe(18);
  });

  it("single meeting in middle → two slots around it", () => {
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 13, 0),
        end: localDate(MON.year, MON.month, MON.day, 14, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy);
    expect(slots).toHaveLength(2);
    // First slot: 10:00-13:00 = 180 min
    expect(slots[0].start.getHours()).toBe(10);
    expect(slots[0].end.getHours()).toBe(13);
    expect(slots[0].durationMin).toBe(180);
    // Second slot: 14:00-18:00 = 240 min
    expect(slots[1].start.getHours()).toBe(14);
    expect(slots[1].end.getHours()).toBe(18);
    expect(slots[1].durationMin).toBe(240);
  });

  it("excludes weekends (Sat and Sun)", () => {
    // 2026-03-07 is Saturday, 2026-03-08 is Sunday
    const satFrom = localDate(2026, 3, 7);
    const monTo = localDate(2026, 3, 9); // range covers Sat+Sun only
    const slots = findFreeSlots(satFrom, monTo, []);
    expect(slots).toHaveLength(0);
  });

  it("travel buffer expands busy times on both sides", () => {
    // Meeting 13:00-14:00, buffer=30 → busy becomes 12:30-14:30
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 13, 0),
        end: localDate(MON.year, MON.month, MON.day, 14, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy, 30);
    expect(slots).toHaveLength(2);
    // First slot: 10:00-12:30 = 150 min
    expect(slots[0].start.getHours()).toBe(10);
    expect(slots[0].end.getHours()).toBe(12);
    expect(slots[0].end.getMinutes()).toBe(30);
    expect(slots[0].durationMin).toBe(150);
    // Second slot: 14:30-18:00 = 210 min
    expect(slots[1].start.getHours()).toBe(14);
    expect(slots[1].start.getMinutes()).toBe(30);
    expect(slots[1].durationMin).toBe(210);
  });

  it("filters out slots shorter than CONFIG.minSlotMinutes (60)", () => {
    // Meetings leave a 30-min gap: 10:00-12:30, gap, 13:00-18:00
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 10, 0),
        end: localDate(MON.year, MON.month, MON.day, 12, 30),
      },
      {
        start: localDate(MON.year, MON.month, MON.day, 13, 0),
        end: localDate(MON.year, MON.month, MON.day, 18, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy);
    // 12:30-13:00 = 30 min → filtered out
    expect(slots).toHaveLength(0);
  });

  it("handles overlapping busy times correctly", () => {
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 11, 0),
        end: localDate(MON.year, MON.month, MON.day, 14, 0),
      },
      {
        start: localDate(MON.year, MON.month, MON.day, 13, 0),
        end: localDate(MON.year, MON.month, MON.day, 15, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy);
    // 10:00-11:00 = 60 min (exactly minSlotMinutes, should be included)
    // 15:00-18:00 = 180 min
    expect(slots).toHaveLength(2);
    expect(slots[0].start.getHours()).toBe(10);
    expect(slots[0].end.getHours()).toBe(11);
    expect(slots[0].durationMin).toBe(60);
    expect(slots[1].start.getHours()).toBe(15);
    expect(slots[1].end.getHours()).toBe(18);
    expect(slots[1].durationMin).toBe(180);
  });

  it("all-day busy event → no slots for that day", () => {
    // All-day event spans midnight to midnight, covering all work hours
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 0, 0),
        end: localDate(MON.year, MON.month, MON.day + 1, 0, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy);
    expect(slots).toHaveLength(0);
  });

  it("multi-day range returns slots for each weekday", () => {
    // Mon-Fri range, no busy times
    const from = localDate(2026, 3, 2); // Monday
    const to = localDate(2026, 3, 7); // Saturday (exclusive end)
    const slots = findFreeSlots(from, to, []);
    expect(slots).toHaveLength(5); // Mon-Fri, one full slot each
    for (const s of slots) {
      expect(s.durationMin).toBe(480);
    }
  });

  it("back-to-back meetings leave no gap slot", () => {
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 10, 0),
        end: localDate(MON.year, MON.month, MON.day, 13, 0),
      },
      {
        start: localDate(MON.year, MON.month, MON.day, 13, 0),
        end: localDate(MON.year, MON.month, MON.day, 18, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy);
    expect(slots).toHaveLength(0);
  });

  it("meeting starting before work hours only blocks from work start", () => {
    // Meeting 8:00-11:00 — only 10:00-11:00 is blocked in work hours
    const busy = [
      {
        start: localDate(MON.year, MON.month, MON.day, 8, 0),
        end: localDate(MON.year, MON.month, MON.day, 11, 0),
      },
    ];
    const slots = findFreeSlots(dayFrom, dayTo, busy);
    expect(slots).toHaveLength(1);
    expect(slots[0].start.getHours()).toBe(11);
    expect(slots[0].end.getHours()).toBe(18);
    expect(slots[0].durationMin).toBe(420);
  });
});

// ============================================================
// sortSlotsByPreference
// ============================================================
describe("sortSlotsByPreference", () => {
  const slots = [
    { start: localDate(2026, 3, 2, 10, 0), label: "10am" },
    { start: localDate(2026, 3, 2, 11, 0), label: "11am" },
    { start: localDate(2026, 3, 2, 14, 0), label: "2pm" },
  ];

  it("null preferStart returns slots unchanged", () => {
    const result = sortSlotsByPreference(slots, null);
    expect(result).toEqual(slots);
  });

  it("undefined preferStart returns slots unchanged", () => {
    const result = sortSlotsByPreference(slots, undefined);
    expect(result).toEqual(slots);
  });

  it("preferStart=11 moves 11:00+ slots before earlier ones", () => {
    const result = sortSlotsByPreference(slots, 11);
    expect(result[0].label).toBe("11am");
    expect(result[1].label).toBe("2pm");
    expect(result[2].label).toBe("10am");
  });

  it("preferStart=10 keeps all slots as preferred (no reorder)", () => {
    const result = sortSlotsByPreference(slots, 10);
    // All slots are >= 10, so all go to preferred bucket in original order
    expect(result[0].label).toBe("10am");
    expect(result[1].label).toBe("11am");
    expect(result[2].label).toBe("2pm");
  });

  it("preferStart=15 puts most slots in early bucket", () => {
    const result = sortSlotsByPreference(slots, 15);
    // Only 14:00 is < 15, so all three go to early
    expect(result[0].label).toBe("10am");
    expect(result[1].label).toBe("11am");
    expect(result[2].label).toBe("2pm");
  });
});

// ============================================================
// formatSlotsForEmail
// ============================================================
describe("formatSlotsForEmail", () => {
  it("groups slots by date with time ranges", () => {
    const slots = [
      {
        date: localDate(2026, 3, 2),
        start: localDate(2026, 3, 2, 10, 0),
        end: localDate(2026, 3, 2, 12, 0),
      },
      {
        date: localDate(2026, 3, 2),
        start: localDate(2026, 3, 2, 14, 0),
        end: localDate(2026, 3, 2, 16, 0),
      },
      {
        date: localDate(2026, 3, 3),
        start: localDate(2026, 3, 3, 10, 0),
        end: localDate(2026, 3, 3, 18, 0),
      },
    ];
    const result = formatSlotsForEmail(slots, null);
    expect(result).toContain("Available times:");
    // Should have two date groups
    expect(result).toContain("10:00-12:00 / 14:00-16:00");
    expect(result).toContain("10:00-18:00");
    expect(result).toContain("Let me know what works");
  });

  it("marks early slots when preferStart is set", () => {
    const slots = [
      {
        date: localDate(2026, 3, 2),
        start: localDate(2026, 3, 2, 10, 0),
        end: localDate(2026, 3, 2, 12, 0),
      },
      {
        date: localDate(2026, 3, 2),
        start: localDate(2026, 3, 2, 14, 0),
        end: localDate(2026, 3, 2, 16, 0),
      },
    ];
    const result = formatSlotsForEmail(slots, 13);
    expect(result).toContain("10:00-12:00 (early)");
    expect(result).not.toContain("14:00-16:00 (early)");
  });

  it("no early markers when preferStart is null", () => {
    const slots = [
      {
        date: localDate(2026, 3, 2),
        start: localDate(2026, 3, 2, 10, 0),
        end: localDate(2026, 3, 2, 12, 0),
      },
    ];
    const result = formatSlotsForEmail(slots, null);
    expect(result).not.toContain("(early)");
  });
});

// ============================================================
// formatSlotsCompact
// ============================================================
describe("formatSlotsCompact", () => {
  it("returns max 3 unique dates", () => {
    const slots = [
      { date: localDate(2026, 3, 2), start: localDate(2026, 3, 2, 10, 0) },
      { date: localDate(2026, 3, 2), start: localDate(2026, 3, 2, 14, 0) },
      { date: localDate(2026, 3, 3), start: localDate(2026, 3, 3, 10, 0) },
      { date: localDate(2026, 3, 4), start: localDate(2026, 3, 4, 11, 0) },
      { date: localDate(2026, 3, 5), start: localDate(2026, 3, 5, 10, 0) },
    ];
    const result = formatSlotsCompact(slots);
    // Should only include 3 dates, comma-separated
    const parts = result.split(", ");
    expect(parts).toHaveLength(3);
  });

  it("includes day-of-week and start time with +", () => {
    const slots = [
      { date: localDate(2026, 3, 2), start: localDate(2026, 3, 2, 10, 0) },
    ];
    const result = formatSlotsCompact(slots);
    // 2026-03-02 is Monday
    expect(result).toContain("Mon");
    expect(result).toContain("10:00+");
  });

  it("deduplicates dates (first slot per date wins)", () => {
    const slots = [
      { date: localDate(2026, 3, 2), start: localDate(2026, 3, 2, 10, 0) },
      { date: localDate(2026, 3, 2), start: localDate(2026, 3, 2, 14, 0) },
    ];
    const result = formatSlotsCompact(slots);
    // Only one entry for March 2
    expect(result.split(", ")).toHaveLength(1);
    expect(result).toContain("10:00+"); // first slot's time
  });

  it("returns empty string for no slots", () => {
    expect(formatSlotsCompact([])).toBe("");
  });
});

// ============================================================
// formatTime / formatDate (only non-trivial edge cases)
// ============================================================
describe("formatTime", () => {
  it("pads minutes to 2 digits", () => {
    expect(formatTime(localDate(2026, 3, 2, 9, 5))).toBe("9:05");
    expect(formatTime(localDate(2026, 3, 2, 10, 0))).toBe("10:00");
  });
});

describe("formatDate", () => {
  it("returns month/day (dayOfWeek) format", () => {
    // 2026-03-02 is Monday
    expect(formatDate(localDate(2026, 3, 2))).toBe("3/2 (Mon)");
  });
});
