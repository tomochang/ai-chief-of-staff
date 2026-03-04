const fs = require("fs");
const path = require("path");

const {
  buildIdentityMap,
  deduplicateMessages,
  extractKeywords,
  keywordOverlap,
} = require("../../scripts/dedup");

// ============================================================
// Helpers
// ============================================================

const fixtureDir = path.join(__dirname, "../fixtures");

function msg(overrides) {
  return {
    id: "email:test1",
    channel: "email",
    from: { name: "Unknown", platformId: "" },
    timestamp: "2026-03-01T10:00:00Z",
    preview: "",
    threadId: null,
    isUnread: true,
    metadata: {},
    tier: "info_only",
    reasons: [],
    ...overrides,
  };
}

// ============================================================
// buildIdentityMap
// ============================================================
describe("buildIdentityMap", () => {
  it("parses relationships.md → person→{name, email, slackId, etc} map", () => {
    const md = fs.readFileSync(
      path.join(fixtureDir, "relationships-identity.md"),
      "utf-8"
    );
    const map = buildIdentityMap(md);

    // Alice has email, slack, LINE
    expect(map.get("alice chen")).toEqual(
      expect.objectContaining({
        name: "Alice Chen",
        email: "alice.chen@acme-corp.com",
        slackId: "U_ALICE_01",
        lineId: "Alice Chen",
      })
    );

    // Bob has email only (no slack, no LINE)
    expect(map.get("bob yamada")).toEqual(
      expect.objectContaining({
        name: "Bob Yamada",
        email: "bob.yamada@partner-inc.co.jp",
      })
    );
    expect(map.get("bob yamada").slackId).toBeUndefined();
  });

  it("handles missing fields gracefully (no email, no slack)", () => {
    const md = fs.readFileSync(
      path.join(fixtureDir, "relationships-identity.md"),
      "utf-8"
    );
    const map = buildIdentityMap(md);

    // Carol has Slack + Messenger but no email
    const carol = map.get("carol martinez");
    expect(carol).toBeDefined();
    expect(carol.slackId).toBe("U_CAROL_03");
    expect(carol.email).toBeUndefined();

    // Dave has no contact info at all
    const dave = map.get("dave park");
    expect(dave).toBeDefined();
    expect(dave.name).toBe("Dave Park");
    expect(dave.email).toBeUndefined();
    expect(dave.slackId).toBeUndefined();
  });

  it("builds reverse lookup indices for platformId→personKey", () => {
    const md = fs.readFileSync(
      path.join(fixtureDir, "relationships-identity.md"),
      "utf-8"
    );
    const map = buildIdentityMap(md);

    // Should be able to look up by email
    expect(map.getByPlatformId("alice.chen@acme-corp.com")).toBe("alice chen");
    // Should be able to look up by Slack userId
    expect(map.getByPlatformId("U_ALICE_01")).toBe("alice chen");
    // Unknown platformId
    expect(map.getByPlatformId("unknown@nowhere.com")).toBeUndefined();
  });
});

// ============================================================
// extractKeywords
// ============================================================
describe("extractKeywords", () => {
  it("tokenizes English text and strips common stopwords", () => {
    const kw = extractKeywords("Please review the deploy request for production");
    expect(kw).toContain("review");
    expect(kw).toContain("deploy");
    expect(kw).toContain("request");
    expect(kw).toContain("production");
    expect(kw).not.toContain("the");
    expect(kw).not.toContain("for");
    expect(kw).not.toContain("please");
  });

  it("tokenizes Japanese text by splitting on character-class boundaries", () => {
    const kw = extractKeywords("デプロイのレビューをお願いします");
    // Should produce CJK segments
    expect(kw.length).toBeGreaterThan(0);
  });

  it("handles mixed Japanese/English text", () => {
    const kw = extractKeywords("deploy reviewのお願い");
    expect(kw).toContain("deploy");
    expect(kw).toContain("review");
  });

  it("returns empty array for empty/null input", () => {
    expect(extractKeywords("")).toEqual([]);
    expect(extractKeywords(null)).toEqual([]);
    expect(extractKeywords(undefined)).toEqual([]);
  });
});

// ============================================================
// keywordOverlap
// ============================================================
describe("keywordOverlap", () => {
  it("returns 1.0 for identical keyword sets", () => {
    expect(keywordOverlap(["deploy", "review"], ["deploy", "review"])).toBe(1.0);
  });

  it("returns 0.0 for disjoint sets", () => {
    expect(keywordOverlap(["deploy", "review"], ["lunch", "tomorrow"])).toBe(0.0);
  });

  it("returns ratio based on Jaccard-like overlap", () => {
    const ratio = keywordOverlap(
      ["deploy", "review", "production"],
      ["deploy", "review", "staging"]
    );
    // intersection=2, union=4 → 0.5
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it("returns 0 if either set is empty", () => {
    expect(keywordOverlap([], ["deploy"])).toBe(0);
    expect(keywordOverlap(["deploy"], [])).toBe(0);
  });
});

// ============================================================
// deduplicateMessages
// ============================================================
describe("deduplicateMessages", () => {
  let identityMap;

  beforeAll(() => {
    const md = fs.readFileSync(
      path.join(fixtureDir, "relationships-identity.md"),
      "utf-8"
    );
    identityMap = buildIdentityMap(md);
  });

  it("same person emails+Slacks about same topic → merged with crossRefs", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Please review the deploy request for production",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T11:00:00Z",
        preview: "Hey, can you review the deploy request for production?",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    expect(result[0].crossRefs).toBeDefined();
    expect(result[0].crossRefs).toHaveLength(1);
    expect(result[0].crossRefs[0]).toEqual(
      expect.objectContaining({
        channel: expect.any(String),
        id: expect.any(String),
        preview: expect.any(String),
      })
    );
  });

  it("different topics from same person → NOT merged", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Please review the deploy request for production",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T11:00:00Z",
        preview: "Want to grab lunch tomorrow at the new ramen place?",
        tier: "info_only",
        reasons: [],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(2);
  });

  it("skip×skip pairs → not deduped (skipped entirely)", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "noreply notification about deploy",
        tier: "skip",
        reasons: ["noreply_sender"],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T10:30:00Z",
        preview: "bot notification about deploy status",
        tier: "skip",
        reasons: ["bot_message"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    // Both should remain — skip messages are not dedup candidates
    expect(result).toHaveLength(2);
    expect(result[0].crossRefs).toBeUndefined();
    expect(result[1].crossRefs).toBeUndefined();
  });

  it("tier promotion (info_only + action_required → action_required)", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "FYI, deploy review summary for production release",
        tier: "info_only",
        reasons: [],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T11:00:00Z",
        preview: "Can you review the deploy for production release?",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe("action_required");
  });

  it("cross-posted link (same URL in email and Slack) → merged", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview:
          "Check the PR at https://github.com/acme/repo/pull/42 for the new feature",
        tier: "info_only",
        reasons: [],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T10:30:00Z",
        preview:
          "Shared https://github.com/acme/repo/pull/42 — please take a look",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    expect(result[0].crossRefs).toHaveLength(1);
  });

  it("messages >24h apart → NOT merged even if same person+topic", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Please review the deploy request for production",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-03T10:00:00Z", // 48h later
        preview: "Please review the deploy request for production",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(2);
  });

  it("primary platform selection (platform with direct question wins)", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "FYI deploy summary for production release attached",
        tier: "info_only",
        reasons: [],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T11:00:00Z",
        preview: "Can you review the deploy summary for production release?",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    // The action_required (Slack with direct question) should be primary
    expect(result[0].id).toBe("slack:s1");
    expect(result[0].crossRefs[0].id).toBe("email:e1");
  });

  it("each merged output has crossRefs array with {channel, id, preview}", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Deploy review for production v2.1",
        tier: "info_only",
        reasons: [],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Alice Chen", platformId: "U_ALICE_01" },
        timestamp: "2026-03-01T10:30:00Z",
        preview: "Deploy review for production v2.1 — thoughts?",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    const ref = result[0].crossRefs[0];
    expect(ref).toHaveProperty("channel");
    expect(ref).toHaveProperty("id");
    expect(ref).toHaveProperty("preview");
    expect(typeof ref.channel).toBe("string");
    expect(typeof ref.id).toBe("string");
    expect(typeof ref.preview).toBe("string");
  });

  it("messages without identity map match → uses from.name exact match fallback", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Unknown Person", platformId: "unknown@example.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Please review the deploy request for production",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
      msg({
        id: "slack:s1",
        channel: "slack",
        from: { name: "Unknown Person", platformId: "U_UNKNOWN" },
        timestamp: "2026-03-01T10:30:00Z",
        preview: "Hey, review the deploy request for production please",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    // No identity map match, but same from.name + same topic → should merge
    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    expect(result[0].crossRefs).toHaveLength(1);
  });

  it("empty input array → returns empty array", () => {
    const result = deduplicateMessages([], identityMap);
    expect(result).toEqual([]);
  });

  it("single message → returns unchanged", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Hello",
        tier: "info_only",
        reasons: [],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(1);
    expect(result[0].crossRefs).toBeUndefined();
  });

  it("preserves non-duplicate messages unchanged", () => {
    const messages = [
      msg({
        id: "email:e1",
        channel: "email",
        from: { name: "Alice Chen", platformId: "alice.chen@acme-corp.com" },
        timestamp: "2026-03-01T10:00:00Z",
        preview: "Project alpha update",
        tier: "info_only",
        reasons: [],
      }),
      msg({
        id: "email:e2",
        channel: "email",
        from: { name: "Bob Yamada", platformId: "bob.yamada@partner-inc.co.jp" },
        timestamp: "2026-03-01T11:00:00Z",
        preview: "Q1 budget proposal attached",
        tier: "action_required",
        reasons: ["question_or_request"],
      }),
    ];

    const result = deduplicateMessages(messages, identityMap);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("email:e1");
    expect(result[1].id).toBe("email:e2");
  });
});
