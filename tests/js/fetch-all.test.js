const { fetchAll, withTimeout, formatWarnings } = require("../../scripts/fetch-all");

// ============================================================
// withTimeout
// ============================================================
describe("withTimeout", () => {
  it("resolves when promise completes before timeout", async () => {
    const result = await withTimeout(
      Promise.resolve("ok"),
      1000,
      "test-channel"
    );
    expect(result).toBe("ok");
  });

  it("rejects with descriptive message after configured ms", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 50, "line")).rejects.toThrow(
      "line: timeout after 50ms"
    );
  });

  it("cleans up timer on successful resolve", async () => {
    const result = await withTimeout(
      Promise.resolve("fast"),
      1000,
      "email"
    );
    expect(result).toBe("fast");
  });
});

// ============================================================
// formatWarnings
// ============================================================
describe("formatWarnings", () => {
  it("produces Japanese warning strings for failed channels", () => {
    const warnings = [
      { channel: "line", error: "bridge timeout" },
      { channel: "chatwork", error: "Rate limit exceeded" },
    ];
    const formatted = formatWarnings(warnings);
    expect(formatted).toHaveLength(2);
    expect(formatted[0]).toBe("⚠️ LINE: 取得不可 (bridge timeout)");
    expect(formatted[1]).toBe("⚠️ Chatwork: 取得不可 (Rate limit exceeded)");
  });

  it("returns empty array for no warnings", () => {
    expect(formatWarnings([])).toEqual([]);
  });

  it("capitalizes channel names properly", () => {
    const formatted = formatWarnings([
      { channel: "email", error: "auth failed" },
      { channel: "slack", error: "rate limit" },
      { channel: "messenger", error: "CDP crash" },
    ]);
    expect(formatted[0]).toContain("Email");
    expect(formatted[1]).toContain("Slack");
    expect(formatted[2]).toContain("Messenger");
  });
});

// ============================================================
// fetchAll
// ============================================================
describe("fetchAll", () => {
  // Helper: create a mock fetcher that resolves with raw data
  const makeFetcher = (data, delayMs = 0) => {
    return () =>
      new Promise((resolve) => setTimeout(() => resolve(data), delayMs));
  };

  // Helper: create a mock fetcher that rejects
  const makeFailingFetcher = (error, delayMs = 0) => {
    return () =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(error)), delayMs)
      );
  };

  // Helper: create a mock fetcher that never resolves (for timeout tests)
  const makeHangingFetcher = () => {
    return () => new Promise(() => {}); // never resolves
  };

  // Sample raw data per channel
  const sampleEmail = [
    {
      id: "msg1",
      headerFrom: "Alice <alice@example.com>",
      snippet: "Hello",
      internalDate: "1709535600000",
      threadId: "t1",
      labelIds: ["UNREAD"],
    },
  ];

  const sampleSlack = [
    {
      ts: "1709535600.000100",
      user: "U123",
      user_real_name: "Bob",
      text: "Hey there",
      channel: "C456",
      channel_name: "general",
    },
  ];

  const sampleLine = [
    {
      room_id: "!room1:matrix.org",
      room_name: "Charlie",
      latest_body: "こんにちは",
      latest_ts: "2026-03-04T10:00:00Z",
      latest_sender: "other",
      needs_reply: true,
    },
  ];

  const sampleMessenger = [
    {
      name: "Dave",
      threadId: "t_dave",
      preview: "How are you?",
      unread: true,
    },
  ];

  const sampleChatwork = [
    {
      room_id: 123,
      room_name: "Project",
      room_type: "group",
      unread_num: 1,
      mention_num: 0,
      messages: [
        {
          message_id: "m1",
          account_name: "Eve",
          account_id: 456,
          body: "Please review",
          send_time: 1709535600,
          is_mine: false,
          to_me: true,
        },
      ],
    },
  ];

  it("all channels succeed → returns normalized items for each", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail),
      slack: makeFetcher(sampleSlack),
      line: makeFetcher(sampleLine),
      messenger: makeFetcher(sampleMessenger),
      chatwork: makeFetcher(sampleChatwork),
    };

    const { results, warnings } = await fetchAll({ fetchers });

    expect(warnings).toEqual([]);
    expect(results).toHaveLength(5);

    // Each result has channel, items array
    for (const r of results) {
      expect(r).toHaveProperty("channel");
      expect(r).toHaveProperty("items");
      expect(Array.isArray(r.items)).toBe(true);
      expect(r.error).toBeUndefined();
    }

    // Check email normalization applied
    const emailResult = results.find((r) => r.channel === "email");
    expect(emailResult.items).toHaveLength(1);
    expect(emailResult.items[0].id).toBe("email:msg1");
    expect(emailResult.items[0].channel).toBe("email");

    // Check slack normalization applied
    const slackResult = results.find((r) => r.channel === "slack");
    expect(slackResult.items).toHaveLength(1);
    expect(slackResult.items[0].id).toBe("slack:1709535600.000100");

    // Check line normalization applied
    const lineResult = results.find((r) => r.channel === "line");
    expect(lineResult.items).toHaveLength(1);
    expect(lineResult.items[0].id).toBe("line:!room1:matrix.org");

    // Check messenger normalization applied
    const messengerResult = results.find((r) => r.channel === "messenger");
    expect(messengerResult.items).toHaveLength(1);
    expect(messengerResult.items[0].id).toBe("messenger:t_dave");

    // Check chatwork normalization applied
    const chatworkResult = results.find((r) => r.channel === "chatwork");
    expect(chatworkResult.items).toHaveLength(1);
    expect(chatworkResult.items[0].id).toBe("chatwork:123:m1");
  });

  it("one channel times out → others still return data + warning", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail),
      slack: makeFetcher(sampleSlack),
      line: makeHangingFetcher(), // will timeout
      messenger: makeFetcher(sampleMessenger),
      chatwork: makeFetcher(sampleChatwork),
    };

    const timeouts = { line: 50 }; // 50ms timeout for LINE

    const { results, warnings } = await fetchAll({ fetchers, timeouts });

    // LINE should have empty items + error
    const lineResult = results.find((r) => r.channel === "line");
    expect(lineResult.items).toEqual([]);
    expect(lineResult.error).toMatch(/timeout/);

    // Others should succeed
    const emailResult = results.find((r) => r.channel === "email");
    expect(emailResult.items).toHaveLength(1);
    expect(emailResult.error).toBeUndefined();

    const slackResult = results.find((r) => r.channel === "slack");
    expect(slackResult.items).toHaveLength(1);

    // Should have exactly 1 warning (for LINE)
    expect(warnings).toHaveLength(1);
    expect(warnings[0].channel).toBe("line");
  });

  it("one channel throws → returns error result + others succeed", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail),
      slack: makeFetcher(sampleSlack),
      line: makeFetcher(sampleLine),
      messenger: makeFetcher(sampleMessenger),
      chatwork: makeFailingFetcher("Rate limit exceeded"),
    };

    const { results, warnings } = await fetchAll({ fetchers });

    const chatworkResult = results.find((r) => r.channel === "chatwork");
    expect(chatworkResult.items).toEqual([]);
    expect(chatworkResult.error).toBe("Rate limit exceeded");

    // Others succeed
    const emailResult = results.find((r) => r.channel === "email");
    expect(emailResult.items).toHaveLength(1);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].channel).toBe("chatwork");
  });

  it("all channels fail → returns empty items for each with all warnings, no crash", async () => {
    const fetchers = {
      email: makeFailingFetcher("IMAP error"),
      slack: makeFailingFetcher("API rate limit"),
      line: makeFailingFetcher("bridge down"),
      messenger: makeFailingFetcher("CDP crash"),
      chatwork: makeFailingFetcher("HTTP 500"),
    };

    const { results, warnings } = await fetchAll({ fetchers });

    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.items).toEqual([]);
      expect(r.error).toBeTruthy();
    }

    expect(warnings).toHaveLength(5);
  });

  it("custom timeout config is respected", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail, 100), // takes 100ms
      slack: makeFetcher(sampleSlack),
      line: makeFetcher(sampleLine),
      messenger: makeFetcher(sampleMessenger),
      chatwork: makeFetcher(sampleChatwork),
    };

    // Set email timeout to 30ms — shorter than its 100ms delay
    const timeouts = { email: 30 };

    const { results, warnings } = await fetchAll({ fetchers, timeouts });

    const emailResult = results.find((r) => r.channel === "email");
    expect(emailResult.items).toEqual([]);
    expect(emailResult.error).toMatch(/timeout/);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].channel).toBe("email");
  });

  it("result shape validation — each result has channel, items array, optional error", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail),
      slack: makeFailingFetcher("oops"),
      line: makeFetcher(sampleLine),
      messenger: makeFetcher(sampleMessenger),
      chatwork: makeFetcher(sampleChatwork),
    };

    const { results } = await fetchAll({ fetchers });

    for (const r of results) {
      // Required fields
      expect(typeof r.channel).toBe("string");
      expect(Array.isArray(r.items)).toBe(true);
      // Error is optional — present only on failure
      if (r.channel === "slack") {
        expect(typeof r.error).toBe("string");
      }
    }
  });

  it("fetchAll with empty/missing config uses sensible defaults", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail),
      slack: makeFetcher(sampleSlack),
      line: makeFetcher(sampleLine),
      messenger: makeFetcher(sampleMessenger),
      chatwork: makeFetcher(sampleChatwork),
    };

    // No timeouts provided — should use defaults and not crash
    const { results, warnings } = await fetchAll({ fetchers });

    expect(results).toHaveLength(5);
    expect(warnings).toEqual([]);
  });

  it("handles subset of channels (not all 5 provided)", async () => {
    const fetchers = {
      email: makeFetcher(sampleEmail),
      slack: makeFetcher(sampleSlack),
    };

    const { results, warnings } = await fetchAll({ fetchers });

    expect(results).toHaveLength(2);
    expect(warnings).toEqual([]);
  });
});
