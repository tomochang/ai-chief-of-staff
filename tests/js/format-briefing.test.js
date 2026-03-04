const { formatBriefing } = require("../../scripts/format-briefing");
const fixture = require("../fixtures/briefing-input.json");

// Helper: create a minimal message
function msg(overrides) {
  return {
    id: "test:1",
    channel: "email",
    from: { name: "Test User", platformId: "test@example.com" },
    timestamp: "2026-03-04T10:00:00+09:00",
    preview: "Test message",
    threadId: "t1",
    isUnread: true,
    metadata: { subject: "Test subject" },
    tier: "info_only",
    reasons: [],
    ...overrides,
  };
}

// ============================================================
// Header
// ============================================================
describe("header", () => {
  it("returns string starting with correct header and date", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^# Today's Briefing — 2026-03-04 \(水\)/);
  });

  it("renders correct day-of-week for different dates", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: [],
      date: "2026-03-02",
    });
    expect(result).toMatch(/^# Today's Briefing — 2026-03-02 \(月\)/);
  });
});

// ============================================================
// Schedule section
// ============================================================
describe("schedule section", () => {
  it("renders table with Time, Event, Location/Link, Prep needed columns", () => {
    const result = formatBriefing({
      messages: [],
      calendar: fixture.calendar,
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("## Schedule");
    expect(result).toContain("| Time");
    expect(result).toContain("| Event");
    expect(result).toContain("Location/Link");
    expect(result).toContain("Prep needed");
  });

  it("renders timed events with time range", () => {
    const result = formatBriefing({
      messages: [],
      calendar: fixture.calendar,
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("09:00-09:30");
    expect(result).toContain("Team Standup");
  });

  it("renders all-day events", () => {
    const result = formatBriefing({
      messages: [],
      calendar: fixture.calendar,
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("All day");
    expect(result).toContain("All Day Offsite");
  });

  it("shows location or hangout link", () => {
    const result = formatBriefing({
      messages: [],
      calendar: fixture.calendar,
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("https://meet.google.com/abc-defg-hij");
    expect(result).toContain("Office Building 3F");
    expect(result).toContain("Restaurant Hiro");
  });

  it("marks events needing prep with ⚠️", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [
        {
          summary: "Client Meeting",
          start: { dateTime: "2026-03-04T14:00:00+09:00" },
          end: { dateTime: "2026-03-04T15:00:00+09:00" },
          description: "Q2 planning review",
        },
      ],
      todos: [],
      date: "2026-03-04",
    });
    // Events with description or "meeting"/"client" in name should get ⚠️
    expect(result).toContain("⚠️");
  });

  it("renders 予定なし when no calendar events", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("予定なし");
  });
});

// ============================================================
// Per-channel sections
// ============================================================
describe("per-channel sections", () => {
  it("groups messages by channel in correct order: Email, Slack, LINE, Messenger, Chatwork", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    const emailIdx = result.indexOf("## Email");
    const slackIdx = result.indexOf("## Slack");
    const lineIdx = result.indexOf("## LINE");
    const messengerIdx = result.indexOf("## Messenger");
    const chatworkIdx = result.indexOf("## Chatwork");
    expect(emailIdx).toBeGreaterThan(-1);
    expect(slackIdx).toBeGreaterThan(emailIdx);
    expect(lineIdx).toBeGreaterThan(slackIdx);
    expect(messengerIdx).toBeGreaterThan(lineIdx);
    expect(chatworkIdx).toBeGreaterThan(messengerIdx);
  });

  it("empty channel (no messages) is omitted entirely from output", () => {
    const emailOnly = fixture.messages.filter((m) => m.channel === "email");
    const result = formatBriefing({
      messages: emailOnly,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("## Email");
    expect(result).not.toContain("## Slack");
    expect(result).not.toContain("## LINE");
    expect(result).not.toContain("## Messenger");
    expect(result).not.toContain("## Chatwork");
  });
});

// ============================================================
// Email-specific rendering
// ============================================================
describe("email rendering", () => {
  it("shows skip count with → auto-archived suffix", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("auto-archived");
    expect(result).toMatch(/Skipped \(2\)/);
  });

  it("shows info_only summaries", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("Info Only");
    expect(result).toContain("Anthropic");
    expect(result).toContain("Receipt #2718");
  });

  it("renders action_required items with numbered list, sender, subject, preview", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("Action Required");
    expect(result).toMatch(/#### 1\. Jane Smith <jane@example\.com>/);
    expect(result).toContain("**Subject**: Q2 timeline");
  });

  it("shows sender with email in angle brackets for action_required", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("Jane Smith <jane@example.com>");
    expect(result).toContain("Alice Chen <alice@example.com>");
  });
});

// ============================================================
// Cross-references
// ============================================================
describe("crossRef display", () => {
  it("displays crossRefs as 📎 on merged messages", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    // Email action2 has crossRef to slack
    expect(result).toMatch(/📎.*Also.*[Ss]lack/);
    // Slack dm1 has crossRef to LINE
    expect(result).toMatch(/📎.*Also.*LINE/);
  });
});

// ============================================================
// Slack-specific rendering
// ============================================================
describe("slack rendering", () => {
  it("shows #channel-name prefix for mentions", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("#product-dev");
    expect(result).toContain("#general");
  });

  it("shows DM with @name prefix", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("@Charlie");
  });
});

// ============================================================
// LINE-specific rendering
// ============================================================
describe("LINE rendering", () => {
  it("shows action_required with Last message and Context for DMs", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("Taro Tanaka");
    expect(result).toContain("**Last message**");
    expect(result).toContain("今週末空いてますか？");
  });
});

// ============================================================
// Messenger-specific rendering
// ============================================================
describe("messenger rendering", () => {
  it("shows action_required with Last message", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    const messengerSection = result.split("## Messenger")[1]?.split(/\n## (?!#)/)[0] || "";
    expect(messengerSection).toContain("John Smith");
    expect(messengerSection).toContain("**Last message**");
  });
});

// ============================================================
// Chatwork-specific rendering
// ============================================================
describe("chatwork rendering", () => {
  it("shows [RoomName] prefix for chatwork messages", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("[ProjectAlpha]");
    expect(result).toContain("[General]");
  });
});

// ============================================================
// Channel with only skip messages
// ============================================================
describe("skip-only channel", () => {
  it("still shows skip count section for channel with only skip messages", () => {
    const skipOnly = [
      msg({
        id: "line:s1",
        channel: "line",
        tier: "skip",
        reasons: ["self_last"],
        from: { name: "Store", platformId: "store_1" },
        preview: "Point balance notification",
      }),
    ];
    const result = formatBriefing({
      messages: skipOnly,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("## LINE");
    expect(result).toContain("Skipped (1)");
  });
});

// ============================================================
// Todo section
// ============================================================
describe("todo section", () => {
  it("renders todo items as checkbox list", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: fixture.todos,
      date: "2026-03-04",
    });
    expect(result).toContain("## Todo");
    expect(result).toContain("- [ ] Prepare for 14:00 client meeting");
    expect(result).toContain("- [ ] Submit expense report");
  });

  it("renders completed todos with checked checkbox", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: fixture.todos,
      date: "2026-03-04",
    });
    expect(result).toContain("- [x] Review PR #42");
  });

  it("accepts plain string todos", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: ["Buy groceries", "Call dentist"],
      date: "2026-03-04",
    });
    expect(result).toContain("- [ ] Buy groceries");
    expect(result).toContain("- [ ] Call dentist");
  });
});

// ============================================================
// Triage queue
// ============================================================
describe("triage queue", () => {
  it("shows counts for stale pending, overdue, today tasks", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: [],
      triageQueue: fixture.triageQueue,
      date: "2026-03-04",
    });
    expect(result).toContain("## Triage Queue");
    expect(result).toContain("Stale/critical pending responses: 2");
    expect(result).toContain("Overdue tasks: 1");
    expect(result).toContain("Today's tasks: 3");
  });
});

// ============================================================
// Footer
// ============================================================
describe("footer", () => {
  it("shows total action_required count broken down by channel", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: [],
      todos: [],
      date: "2026-03-04",
    });
    expect(result).toContain("Briefing complete.");
    // 2 email + 2 slack (mention1 + dm1) + 1 line + 1 messenger + 1 chatwork = 7
    expect(result).toContain("7 action_required items");
    expect(result).toMatch(/Email: 2/);
    expect(result).toMatch(/Slack: 2/);
    expect(result).toMatch(/LINE: 1/);
    expect(result).toMatch(/Messenger: 1/);
    expect(result).toMatch(/Chatwork: 1/);
  });

  it("shows triage count in footer when triageQueue provided", () => {
    const result = formatBriefing({
      messages: [],
      calendar: [],
      todos: [],
      triageQueue: fixture.triageQueue,
      date: "2026-03-04",
    });
    expect(result).toContain("triage items pending decision in Step 3");
  });
});

// ============================================================
// Mixed fixture integration test
// ============================================================
describe("mixed fixture integration", () => {
  it("produces valid Markdown with all channels, tiers, and crossRefs", () => {
    const result = formatBriefing({
      messages: fixture.messages,
      calendar: fixture.calendar,
      todos: fixture.todos,
      triageQueue: fixture.triageQueue,
      date: fixture.date,
    });

    // Header
    expect(result).toMatch(/^# Today's Briefing — 2026-03-04 \(水\)/);

    // Schedule
    expect(result).toContain("## Schedule");
    expect(result).toContain("Team Standup");
    expect(result).toContain("Client Meeting");

    // All 5 channels present
    expect(result).toContain("## Email");
    expect(result).toContain("## Slack");
    expect(result).toContain("## LINE");
    expect(result).toContain("## Messenger");
    expect(result).toContain("## Chatwork");

    // Todo
    expect(result).toContain("## Todo");

    // Triage
    expect(result).toContain("## Triage Queue");

    // Footer
    expect(result).toContain("Briefing complete.");

    // Cross-refs
    expect(result).toMatch(/📎/);
  });
});
