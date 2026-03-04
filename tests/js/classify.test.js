const { classifyMessage } = require("../../scripts/classify");

// Helper to create a minimal canonical message
function msg(overrides) {
  return {
    id: "test:1",
    channel: "email",
    from: { name: "Test User", platformId: "test@example.com" },
    timestamp: "2026-03-04T10:00:00+09:00",
    preview: "通常のメッセージ",
    threadId: "t1",
    isUnread: true,
    metadata: {},
    ...overrides,
  };
}

// ============================================================
// skip patterns
// ============================================================
describe("skip classification", () => {
  describe("email skip", () => {
    it("noreply sender", () => {
      const r = classifyMessage(msg({ from: { name: "GitHub", platformId: "noreply@github.com" } }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("noreply_sender");
    });

    it("no-reply sender", () => {
      const r = classifyMessage(msg({ from: { name: "Slack", platformId: "no-reply@slack.com" } }));
      expect(r.tier).toBe("skip");
    });

    it("notification sender", () => {
      const r = classifyMessage(msg({ from: { name: "Jira", platformId: "notification@jira.com" } }));
      expect(r.tier).toBe("skip");
    });

    it("@github.com domain", () => {
      const r = classifyMessage(msg({ from: { name: "GitHub", platformId: "notifications@github.com" } }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("bot_domain");
    });

    it("@slack.com domain", () => {
      const r = classifyMessage(msg({ from: { name: "Slack", platformId: "feedback@slack.com" } }));
      expect(r.tier).toBe("skip");
    });

    it("@notion.so domain", () => {
      const r = classifyMessage(msg({ from: { name: "Notion", platformId: "notify@notion.so" } }));
      expect(r.tier).toBe("skip");
    });

    it("subject with [GitHub]", () => {
      const r = classifyMessage(msg({ metadata: { subject: "[GitHub] PR #123 merged" } }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("bot_subject_tag");
    });

    it("subject with [Slack]", () => {
      const r = classifyMessage(msg({ metadata: { subject: "[Slack] New message in #general" } }));
      expect(r.tier).toBe("skip");
    });

    it("subject with [Jira]", () => {
      const r = classifyMessage(msg({ metadata: { subject: "[Jira] PROJ-123 updated" } }));
      expect(r.tier).toBe("skip");
    });
  });

  describe("slack skip", () => {
    it("bot message", () => {
      const r = classifyMessage(msg({
        channel: "slack",
        metadata: { isBotMessage: true, subtype: "bot_message" },
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("bot_message");
    });

    it("channel_join subtype", () => {
      const r = classifyMessage(msg({
        channel: "slack",
        metadata: { subtype: "channel_join" },
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("system_event");
    });

    it("channel_leave subtype", () => {
      const r = classifyMessage(msg({
        channel: "slack",
        metadata: { subtype: "channel_leave" },
      }));
      expect(r.tier).toBe("skip");
    });

    it("channel_topic subtype", () => {
      const r = classifyMessage(msg({
        channel: "slack",
        metadata: { subtype: "channel_topic" },
      }));
      expect(r.tier).toBe("skip");
    });

    it("reminder_add subtype", () => {
      const r = classifyMessage(msg({
        channel: "slack",
        metadata: { subtype: "reminder_add" },
      }));
      expect(r.tier).toBe("skip");
    });
  });

  describe("messenger skip", () => {
    it("already replied (You:)", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "You: はい、了解です",
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("already_replied");
    });

    it("already replied (あなた:)", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "あなた: 承知しました",
      }));
      expect(r.tier).toBe("skip");
    });

    it("system message — added to group", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "Alice added Bob to the group",
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("system_message");
    });

    it("system message — グループに追加", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "太郎がグループに追加しました",
      }));
      expect(r.tier).toBe("skip");
    });

    it("system message — named the group", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "Alice named the group 'Team Chat'",
      }));
      expect(r.tier).toBe("skip");
    });

    it("parse error — Active now", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        from: { name: "Active now", platformId: "unknown" },
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("parse_error");
    });

    it("parse error — オンライン中", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        from: { name: "オンライン中", platformId: "unknown" },
      }));
      expect(r.tier).toBe("skip");
    });
  });

  describe("chatwork skip", () => {
    it("my room type", () => {
      const r = classifyMessage(msg({
        channel: "chatwork",
        metadata: { roomType: "my" },
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("personal_memo");
    });
  });

  describe("line skip", () => {
    it("self as latest sender", () => {
      const r = classifyMessage(msg({
        channel: "line",
        isUnread: false,
        metadata: { latestSender: "self", needsReply: false },
      }));
      expect(r.tier).toBe("skip");
      expect(r.reasons).toContain("self_last");
    });
  });
});

// ============================================================
// meeting_info patterns
// ============================================================
describe("meeting_info classification", () => {
  it("detects Zoom URL", () => {
    const r = classifyMessage(msg({
      preview: "明日のMTGリンクです https://zoom.us/j/123456789",
    }));
    expect(r.tier).toBe("meeting_info");
    expect(r.reasons).toContain("meeting_link");
  });

  it("detects Teams URL", () => {
    const r = classifyMessage(msg({
      preview: "Teams会議 https://teams.microsoft.com/l/meetup-join/abc",
    }));
    expect(r.tier).toBe("meeting_info");
  });

  it("detects Google Meet URL", () => {
    const r = classifyMessage(msg({
      preview: "Meet https://meet.google.com/abc-defg-hij",
    }));
    expect(r.tier).toBe("meeting_info");
  });

  it("detects WebEx URL", () => {
    const r = classifyMessage(msg({
      preview: "WebEx https://example.webex.com/meet/abc",
    }));
    expect(r.tier).toBe("meeting_info");
  });

  it("does not trigger on plain text mentioning 'zoom'", () => {
    const r = classifyMessage(msg({
      preview: "let me zoom in on this issue",
    }));
    expect(r.tier).not.toBe("meeting_info");
  });
});

// ============================================================
// action_required patterns
// ============================================================
describe("action_required classification", () => {
  describe("question/request keywords", () => {
    it("detects ？ (fullwidth)", () => {
      const r = classifyMessage(msg({
        preview: "明日の件、どうしましょう？",
      }));
      expect(r.tier).toBe("action_required");
      expect(r.reasons).toContain("question_or_request");
    });

    it("detects ? (halfwidth)", () => {
      const r = classifyMessage(msg({
        preview: "Can you review this?",
      }));
      expect(r.tier).toBe("action_required");
    });

    it("detects お願い", () => {
      const r = classifyMessage(msg({ preview: "確認をお願いします" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects いかがでしょう", () => {
      const r = classifyMessage(msg({ preview: "来週はいかがでしょうか" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects ご確認", () => {
      const r = classifyMessage(msg({ preview: "ご確認ください" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects ご連絡", () => {
      const r = classifyMessage(msg({ preview: "ご連絡お待ちしております" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects ご都合", () => {
      const r = classifyMessage(msg({ preview: "ご都合のよい日をお知らせください" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects 日程", () => {
      const r = classifyMessage(msg({ preview: "日程調整させてください" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects please/confirm (English)", () => {
      const r = classifyMessage(msg({ preview: "Please confirm the schedule" }));
      expect(r.tier).toBe("action_required");
    });

    it("detects can you", () => {
      const r = classifyMessage(msg({ preview: "Can you take a look at this?" }));
      expect(r.tier).toBe("action_required");
    });
  });

  describe("messenger mention patterns", () => {
    it("detects @Tomo mention", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "@Tomo 確認してください",
      }));
      expect(r.tier).toBe("action_required");
      expect(r.reasons).toContain("mentioned");
    });

    it("detects @水野 mention", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        preview: "@水野 日程調整お願いします",
      }));
      expect(r.tier).toBe("action_required");
    });
  });

  describe("chatwork mentions", () => {
    it("detects to_me flag", () => {
      const r = classifyMessage(msg({
        channel: "chatwork",
        metadata: { toMe: true, roomType: "group" },
      }));
      expect(r.tier).toBe("action_required");
      expect(r.reasons).toContain("direct_mention");
    });
  });

  describe("DM / needs_reply", () => {
    it("LINE needs_reply → action_required", () => {
      const r = classifyMessage(msg({
        channel: "line",
        metadata: { needsReply: true, roomType: "dm", latestSender: "other" },
      }));
      expect(r.tier).toBe("action_required");
      expect(r.reasons).toContain("needs_reply");
    });

    it("LINE group never action_required even with question", () => {
      const r = classifyMessage(msg({
        channel: "line",
        preview: "これどうしましょう？",
        metadata: { roomType: "group", needsReply: false, latestSender: "other" },
      }));
      expect(r.tier).not.toBe("action_required");
    });

    it("messenger E2EE unresolvable → action_required", () => {
      const r = classifyMessage(msg({
        channel: "messenger",
        isUnread: true,
        metadata: { isE2ee: true, e2eeResolved: false },
      }));
      expect(r.tier).toBe("action_required");
      expect(r.reasons).toContain("unreadable_e2ee");
    });
  });
});

// ============================================================
// info_only fallback
// ============================================================
describe("info_only classification", () => {
  it("email with no special patterns → info_only", () => {
    const r = classifyMessage(msg({
      from: { name: "Colleague", platformId: "colleague@company.com" },
      preview: "FYI — 先週のレポート添付します",
    }));
    expect(r.tier).toBe("info_only");
  });

  it("slack message without mention or question", () => {
    const r = classifyMessage(msg({
      channel: "slack",
      preview: "チームランチの写真です",
      metadata: { channelName: "#general" },
    }));
    expect(r.tier).toBe("info_only");
  });

  it("chatwork group without mention", () => {
    const r = classifyMessage(msg({
      channel: "chatwork",
      preview: "報告です。進捗は順調です。",
      metadata: { toMe: false, roomType: "group" },
    }));
    expect(r.tier).toBe("info_only");
  });
});

// ============================================================
// priority: skip > meeting_info > action_required > info_only
// ============================================================
describe("priority order", () => {
  it("skip beats meeting_info: noreply with Zoom link", () => {
    const r = classifyMessage(msg({
      from: { name: "Zoom", platformId: "noreply@zoom.us" },
      preview: "Your meeting is starting https://zoom.us/j/123",
    }));
    expect(r.tier).toBe("skip");
  });

  it("meeting_info beats action_required: Zoom link with question", () => {
    const r = classifyMessage(msg({
      from: { name: "Tanaka", platformId: "tanaka@company.com" },
      preview: "明日のMTGリンクです https://zoom.us/j/123 ご確認ください",
    }));
    expect(r.tier).toBe("meeting_info");
  });

  it("action_required beats info_only: question from normal sender", () => {
    const r = classifyMessage(msg({
      from: { name: "Tanaka", platformId: "tanaka@company.com" },
      preview: "いかがでしょうか",
    }));
    expect(r.tier).toBe("action_required");
  });
});

// ============================================================
// edge cases
// ============================================================
describe("edge cases", () => {
  it("empty preview → info_only", () => {
    const r = classifyMessage(msg({ preview: "" }));
    expect(r.tier).toBe("info_only");
  });

  it("null-ish metadata fields don't crash", () => {
    const r = classifyMessage(msg({ metadata: null }));
    expect(r.tier).toBeTruthy();
  });

  it("returns reasons array always", () => {
    const r = classifyMessage(msg());
    expect(Array.isArray(r.reasons)).toBe(true);
  });

  it("returns tier as string always", () => {
    const r = classifyMessage(msg());
    expect(typeof r.tier).toBe("string");
  });
});
