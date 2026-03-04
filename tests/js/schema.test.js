const {
  validateMessage,
  normalizeMessenger,
  normalizeEmail,
  normalizeSlack,
  normalizeLine,
  normalizeChatwork,
} = require("../../scripts/schema");

// ============================================================
// validateMessage
// ============================================================
describe("validateMessage", () => {
  const validMsg = {
    id: "messenger:12345",
    channel: "messenger",
    from: { name: "田中太郎", platformId: "12345" },
    timestamp: "2026-03-04T10:00:00+09:00",
    preview: "こんにちは",
    threadId: "t_12345",
    isUnread: true,
    metadata: {},
  };

  it("valid message returns no errors", () => {
    expect(validateMessage(validMsg)).toEqual([]);
  });

  it("missing id", () => {
    const msg = { ...validMsg, id: undefined };
    const errors = validateMessage(msg);
    expect(errors).toContain("id is required");
  });

  it("missing channel", () => {
    const msg = { ...validMsg, channel: undefined };
    const errors = validateMessage(msg);
    expect(errors).toContain("channel is required");
  });

  it("invalid channel value", () => {
    const msg = { ...validMsg, channel: "discord" };
    const errors = validateMessage(msg);
    expect(errors.some((e) => e.includes("channel must be one of"))).toBe(
      true
    );
  });

  it("missing from", () => {
    const msg = { ...validMsg, from: undefined };
    const errors = validateMessage(msg);
    expect(errors).toContain("from is required");
  });

  it("from without name", () => {
    const msg = { ...validMsg, from: { platformId: "abc" } };
    const errors = validateMessage(msg);
    expect(errors).toContain("from.name is required");
  });

  it("missing timestamp", () => {
    const msg = { ...validMsg, timestamp: undefined };
    const errors = validateMessage(msg);
    expect(errors).toContain("timestamp is required");
  });

  it("missing preview", () => {
    const msg = { ...validMsg, preview: undefined };
    const errors = validateMessage(msg);
    expect(errors).toContain("preview is required");
  });

  it("isUnread defaults to false if missing", () => {
    const msg = { ...validMsg, isUnread: undefined };
    // Should not error — isUnread is optional (defaults false)
    expect(validateMessage(msg)).toEqual([]);
  });

  it("metadata defaults to empty object if missing", () => {
    const msg = { ...validMsg, metadata: undefined };
    expect(validateMessage(msg)).toEqual([]);
  });

  it("allows all valid channels", () => {
    for (const ch of ["email", "slack", "line", "messenger", "chatwork"]) {
      const msg = { ...validMsg, channel: ch };
      expect(validateMessage(msg)).toEqual([]);
    }
  });
});

// ============================================================
// normalizeMessenger
// ============================================================
describe("normalizeMessenger", () => {
  const messengerChat = {
    index: 0,
    name: "百合本 安彦",
    preview:
      "おはようございます。少しお聞きしたいのですが、英国のMFSの破綻などにより",
    unread: true,
    lineCount: 3,
    threadUrl: "https://www.messenger.com/t/930186519404589",
    threadId: "930186519404589",
    isE2ee: false,
    category: "action_required",
    skipReasons: [],
    actionReasons: ["question_or_request"],
    e2eeResolved: undefined,
  };

  it("normalizes a single chat", () => {
    const result = normalizeMessenger([messengerChat]);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg.id).toBe("messenger:930186519404589");
    expect(msg.channel).toBe("messenger");
    expect(msg.from.name).toBe("百合本 安彦");
    expect(msg.from.platformId).toBe("930186519404589");
    expect(msg.preview).toContain("おはようございます");
    expect(msg.threadId).toBe("930186519404589");
    expect(msg.isUnread).toBe(true);
    expect(msg.metadata.isE2ee).toBe(false);
    expect(msg.metadata.threadUrl).toBe(
      "https://www.messenger.com/t/930186519404589"
    );
    expect(validateMessage(msg)).toEqual([]);
  });

  it("handles E2EE chat", () => {
    const e2ee = {
      ...messengerChat,
      threadUrl: "https://www.messenger.com/e2ee/t/2051637975665830",
      threadId: "2051637975665830",
      isE2ee: true,
      e2eeResolved: true,
    };
    const result = normalizeMessenger([e2ee]);
    expect(result[0].metadata.isE2ee).toBe(true);
    expect(result[0].metadata.e2eeResolved).toBe(true);
  });

  it("handles null threadId — uses index as fallback", () => {
    const noThread = { ...messengerChat, threadId: null, threadUrl: null };
    const result = normalizeMessenger([noThread]);
    expect(result[0].id).toBe("messenger:idx_0");
    expect(result[0].threadId).toBeNull();
  });

  it("normalizes empty array", () => {
    expect(normalizeMessenger([])).toEqual([]);
  });

  it("all output passes validation", () => {
    const chats = [
      messengerChat,
      { ...messengerChat, index: 1, threadId: "999", threadUrl: null },
    ];
    const result = normalizeMessenger(chats);
    for (const msg of result) {
      expect(validateMessage(msg)).toEqual([]);
    }
  });
});

// ============================================================
// normalizeEmail
// ============================================================
describe("normalizeEmail", () => {
  const emailMsg = {
    id: "msg_abc123",
    threadId: "thread_abc123",
    headerFrom: "Tanaka Taro <tanaka@example.com>",
    headerTo: "user@example.com",
    headerCc: "other@example.com",
    subject: "デプロイの件",
    snippet: "お疲れ様です。デプロイの確認をお願いします。",
    internalDate: "1709524800000",
    labelIds: ["INBOX", "UNREAD"],
  };

  it("normalizes a single email", () => {
    const result = normalizeEmail([emailMsg]);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg.id).toBe("email:msg_abc123");
    expect(msg.channel).toBe("email");
    expect(msg.from.name).toBe("Tanaka Taro");
    expect(msg.from.platformId).toBe("tanaka@example.com");
    expect(msg.preview).toContain("デプロイの確認");
    expect(msg.threadId).toBe("thread_abc123");
    expect(msg.isUnread).toBe(true);
    expect(msg.metadata.subject).toBe("デプロイの件");
    expect(msg.metadata.headerTo).toBe("user@example.com");
    expect(validateMessage(msg)).toEqual([]);
  });

  it("parses From header without angle brackets", () => {
    const plain = { ...emailMsg, headerFrom: "simple@test.com" };
    const result = normalizeEmail([plain]);
    expect(result[0].from.name).toBe("simple@test.com");
    expect(result[0].from.platformId).toBe("simple@test.com");
  });

  it("parses From header with quoted name", () => {
    const quoted = {
      ...emailMsg,
      headerFrom: '"Yamada, Hanako" <yamada@test.com>',
    };
    const result = normalizeEmail([quoted]);
    expect(result[0].from.name).toBe("Yamada, Hanako");
    expect(result[0].from.platformId).toBe("yamada@test.com");
  });

  it("detects unread from labelIds", () => {
    const read = { ...emailMsg, labelIds: ["INBOX"] };
    const result = normalizeEmail([read]);
    expect(result[0].isUnread).toBe(false);
  });

  it("handles missing labelIds", () => {
    const noLabels = { ...emailMsg, labelIds: undefined };
    const result = normalizeEmail([noLabels]);
    expect(result[0].isUnread).toBe(false);
  });

  it("converts internalDate to ISO timestamp", () => {
    const result = normalizeEmail([emailMsg]);
    expect(result[0].timestamp).toBeTruthy();
    // Should be valid ISO date
    expect(new Date(result[0].timestamp).toISOString()).toBeTruthy();
  });

  it("normalizes empty array", () => {
    expect(normalizeEmail([])).toEqual([]);
  });
});

// ============================================================
// normalizeSlack
// ============================================================
describe("normalizeSlack", () => {
  const slackMsg = {
    user: "U1234567890",
    text: "デプロイの件、確認お願いします <@U9999999999>",
    ts: "1709524800.123456",
    thread_ts: "1709524700.000000",
    channel: "C0001",
    channel_name: "#product-dev",
    user_name: "tanaka",
    user_real_name: "田中太郎",
  };

  it("normalizes a single message", () => {
    const result = normalizeSlack([slackMsg]);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg.id).toBe("slack:1709524800.123456");
    expect(msg.channel).toBe("slack");
    expect(msg.from.name).toBe("田中太郎");
    expect(msg.from.platformId).toBe("U1234567890");
    expect(msg.preview).toContain("デプロイの件");
    expect(msg.threadId).toBe("1709524700.000000");
    expect(msg.metadata.channelId).toBe("C0001");
    expect(msg.metadata.channelName).toBe("#product-dev");
    expect(validateMessage(msg)).toEqual([]);
  });

  it("uses ts as threadId when no thread_ts", () => {
    const noThread = { ...slackMsg, thread_ts: undefined };
    const result = normalizeSlack([noThread]);
    expect(result[0].threadId).toBe("1709524800.123456");
  });

  it("falls back to user_name when user_real_name missing", () => {
    const noReal = { ...slackMsg, user_real_name: undefined };
    const result = normalizeSlack([noReal]);
    expect(result[0].from.name).toBe("tanaka");
  });

  it("marks bot messages in metadata", () => {
    const bot = {
      ...slackMsg,
      bot_id: "B123",
      subtype: "bot_message",
    };
    const result = normalizeSlack([bot]);
    expect(result[0].metadata.isBotMessage).toBe(true);
    expect(result[0].metadata.subtype).toBe("bot_message");
  });

  it("converts ts to ISO timestamp", () => {
    const result = normalizeSlack([slackMsg]);
    expect(new Date(result[0].timestamp).toISOString()).toBeTruthy();
  });

  it("normalizes empty array", () => {
    expect(normalizeSlack([])).toEqual([]);
  });
});

// ============================================================
// normalizeLine
// ============================================================
describe("normalizeLine", () => {
  const lineRoom = {
    room_id: "!abc:matrix.local",
    room_name: "田中太郎",
    type: "dm",
    latest_ts: "03/04 10:00",
    latest_sender: "other",
    latest_body: "お疲れ様です。明日の件ですが",
    needs_reply: true,
  };

  it("normalizes a single room", () => {
    const result = normalizeLine([lineRoom]);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg.id).toBe("line:!abc:matrix.local");
    expect(msg.channel).toBe("line");
    expect(msg.from.name).toBe("田中太郎");
    expect(msg.from.platformId).toBe("!abc:matrix.local");
    expect(msg.preview).toContain("明日の件");
    expect(msg.threadId).toBe("!abc:matrix.local");
    expect(msg.isUnread).toBe(true);
    expect(msg.metadata.roomType).toBe("dm");
    expect(msg.metadata.needsReply).toBe(true);
    expect(validateMessage(msg)).toEqual([]);
  });

  it("handles self as latest_sender → not unread", () => {
    const self = { ...lineRoom, latest_sender: "self", needs_reply: false };
    const result = normalizeLine([self]);
    expect(result[0].isUnread).toBe(false);
  });

  it("handles group type", () => {
    const group = { ...lineRoom, type: "group", room_name: "開発チーム" };
    const result = normalizeLine([group]);
    expect(result[0].metadata.roomType).toBe("group");
    expect(result[0].from.name).toBe("開発チーム");
  });

  it("normalizes empty array", () => {
    expect(normalizeLine([])).toEqual([]);
  });
});

// ============================================================
// normalizeChatwork
// ============================================================
describe("normalizeChatwork", () => {
  const chatworkRoom = {
    room_id: 100,
    room_name: "Project Alpha",
    room_type: "group",
    unread_num: 3,
    mention_num: 1,
    needs_action: true,
    messages: [
      {
        message_id: 5001,
        account_id: 9999,
        account_name: "佐藤花子",
        body: "進捗確認をお願いします",
        send_time: 1709524800,
        is_mine: false,
        to_me: true,
      },
      {
        message_id: 5002,
        account_id: 12345,
        account_name: "水野智",
        body: "了解しました",
        send_time: 1709525000,
        is_mine: true,
        to_me: false,
      },
    ],
  };

  it("normalizes room — uses latest non-self message", () => {
    const result = normalizeChatwork([chatworkRoom]);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg.id).toBe("chatwork:100:5001");
    expect(msg.channel).toBe("chatwork");
    expect(msg.from.name).toBe("佐藤花子");
    expect(msg.from.platformId).toBe("9999");
    expect(msg.preview).toContain("進捗確認");
    expect(msg.threadId).toBe("100");
    expect(msg.isUnread).toBe(true);
    expect(msg.metadata.roomType).toBe("group");
    expect(msg.metadata.mentionCount).toBe(1);
    expect(validateMessage(msg)).toEqual([]);
  });

  it("skips rooms with only self messages", () => {
    const selfOnly = {
      ...chatworkRoom,
      messages: [chatworkRoom.messages[1]], // only self message
    };
    const result = normalizeChatwork([selfOnly]);
    // Should still produce a message, but from self
    expect(result).toHaveLength(1);
    expect(result[0].from.name).toBe("水野智");
    expect(result[0].isUnread).toBe(false);
  });

  it("handles room with no messages", () => {
    const empty = { ...chatworkRoom, messages: [] };
    const result = normalizeChatwork([empty]);
    expect(result).toHaveLength(0);
  });

  it("skips 'my' room type", () => {
    const myRoom = { ...chatworkRoom, room_type: "my" };
    const result = normalizeChatwork([myRoom]);
    expect(result).toHaveLength(0);
  });

  it("handles direct room type", () => {
    const direct = { ...chatworkRoom, room_type: "direct" };
    const result = normalizeChatwork([direct]);
    expect(result[0].metadata.roomType).toBe("direct");
  });

  it("normalizes empty array", () => {
    expect(normalizeChatwork([])).toEqual([]);
  });
});
