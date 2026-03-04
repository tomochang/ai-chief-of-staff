const {
  extractThreadInfo,
  deduplicateByThreadId,
  deduplicateByNamePreview,
  detectDuplicatePreview,
  isDateRow,
  isSystemMessage,
  isTimeOnlyRow,
  filterMessageRows,
  isE2eePlaceholder,
  classifyChat,
  parseChatRow,
} = require("../../scripts/messenger-check-lib");

// ============================================================
// extractThreadInfo
// ============================================================
describe("extractThreadInfo", () => {
  it("通常スレッドURLからthreadIdを抽出", () => {
    const result = extractThreadInfo("https://www.messenger.com/t/1234567890/");
    expect(result).toEqual({ threadId: "1234567890", isE2ee: false });
  });

  it("E2EEスレッドURLからthreadIdとフラグを抽出", () => {
    const result = extractThreadInfo("https://www.messenger.com/e2ee/t/9876543210/");
    expect(result).toEqual({ threadId: "9876543210", isE2ee: true });
  });

  it("nullを渡すとnullを返す", () => {
    expect(extractThreadInfo(null)).toEqual({ threadId: null, isE2ee: false });
  });

  it("無効なURLはnullを返す", () => {
    expect(extractThreadInfo("https://www.messenger.com/")).toEqual({ threadId: null, isE2ee: false });
  });

  it("数字以外のthreadIdは無視", () => {
    expect(extractThreadInfo("https://www.messenger.com/t/abc/")).toEqual({ threadId: null, isE2ee: false });
  });

  it("パスの途中にt/が含まれるケース", () => {
    const result = extractThreadInfo("https://www.messenger.com/e2ee/t/111222333444/some-extra");
    expect(result).toEqual({ threadId: "111222333444", isE2ee: true });
  });
});

// ============================================================
// deduplicateByThreadId (Layer 1)
// ============================================================
describe("deduplicateByThreadId", () => {
  it("同じthreadIdの重複を除去", () => {
    const chats = [
      { name: "Alice", threadId: "123", preview: "hello" },
      { name: "Alice", threadId: "123", preview: "hello again" },
      { name: "Bob", threadId: "456", preview: "hi" },
    ];
    const result = deduplicateByThreadId(chats);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[0].preview).toBe("hello");
    expect(result[1].name).toBe("Bob");
  });

  it("threadIdがnullのエントリは全て保持", () => {
    const chats = [
      { name: "Alice", threadId: null, preview: "hello" },
      { name: "Alice", threadId: null, preview: "hello" },
    ];
    const result = deduplicateByThreadId(chats);
    expect(result).toHaveLength(2);
  });

  it("空配列は空配列を返す", () => {
    expect(deduplicateByThreadId([])).toEqual([]);
  });

  it("3つの同一threadIdで最初のみ残る", () => {
    const chats = [
      { name: "A", threadId: "100", preview: "first" },
      { name: "B", threadId: "100", preview: "second" },
      { name: "C", threadId: "100", preview: "third" },
    ];
    const result = deduplicateByThreadId(chats);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("A");
  });
});

// ============================================================
// deduplicateByNamePreview (Layer 2)
// ============================================================
describe("deduplicateByNamePreview", () => {
  it("同じ名前+プレビューの重複を除去", () => {
    const chats = [
      { name: "Alice", preview: "hello world" },
      { name: "Alice", preview: "hello world" },
      { name: "Bob", preview: "hello world" },
    ];
    const result = deduplicateByNamePreview(chats);
    expect(result).toHaveLength(2);
  });

  it("同じ名前でもプレビューが異なれば保持", () => {
    const chats = [
      { name: "Alice", preview: "message 1" },
      { name: "Alice", preview: "message 2" },
    ];
    const result = deduplicateByNamePreview(chats);
    expect(result).toHaveLength(2);
  });

  it("previewがnull/undefinedでも安全", () => {
    const chats = [
      { name: "Alice", preview: null },
      { name: "Bob", preview: undefined },
    ];
    const result = deduplicateByNamePreview(chats);
    expect(result).toHaveLength(2);
  });

  it("80文字以降が異なるだけのプレビューは同一とみなす", () => {
    const long = "あ".repeat(80);
    const chats = [
      { name: "Alice", preview: long + "X" },
      { name: "Alice", preview: long + "Y" },
    ];
    const result = deduplicateByNamePreview(chats);
    expect(result).toHaveLength(1);
  });
});

// ============================================================
// detectDuplicatePreview (Layer 3) — 今回のバグの核心
// ============================================================
describe("detectDuplicatePreview", () => {
  it("最初の解決は重複なし", () => {
    const map = new Map();
    const result = detectDuplicatePreview(map, "おはようございます", "thread_A");
    expect(result.isDuplicate).toBe(false);
    expect(map.get("おはようございます")).toBe("thread_A");
  });

  it("同じプレビューが別スレッドで解決されたら重複", () => {
    const map = new Map();
    detectDuplicatePreview(map, "おはようございます", "thread_A");
    const result = detectDuplicatePreview(map, "おはようございます", "thread_B");
    expect(result.isDuplicate).toBe(true);
    expect(result.existingThreadId).toBe("thread_A");
  });

  it("同じスレッドで同じプレビューは重複にならない", () => {
    const map = new Map();
    detectDuplicatePreview(map, "おはようございます", "thread_A");
    const result = detectDuplicatePreview(map, "おはようございます", "thread_A");
    expect(result.isDuplicate).toBe(false);
  });

  it("100文字以降が異なるプレビューは同一とみなす", () => {
    const map = new Map();
    const base = "あ".repeat(100);
    detectDuplicatePreview(map, base + "X", "thread_A");
    const result = detectDuplicatePreview(map, base + "Y", "thread_B");
    expect(result.isDuplicate).toBe(true);
  });

  it("100文字未満の異なるプレビューは別物", () => {
    const map = new Map();
    detectDuplicatePreview(map, "メッセージA", "thread_A");
    const result = detectDuplicatePreview(map, "メッセージB", "thread_B");
    expect(result.isDuplicate).toBe(false);
  });

  // バグ再現: E2EE解決時に同一プレビューが別スレッドに割り当てられる
  it("バグ再現: 同一メッセージが異なるスレッドに解決される", () => {
    const map = new Map();
    const sharedMessage = "おはようございます。少しお聞きしたいのですが、先日の件について確認させてください...";

    // スレッドAで最初に解決
    const first = detectDuplicatePreview(map, sharedMessage, "100000000000001");
    expect(first.isDuplicate).toBe(false);

    // スレッドBで同じメッセージが解決されようとする → 重複検出
    const second = detectDuplicatePreview(map, sharedMessage, "200000000000002");
    expect(second.isDuplicate).toBe(true);
    expect(second.existingThreadId).toBe("100000000000001");
  });
});

// ============================================================
// Message Filtering
// ============================================================
describe("isDateRow", () => {
  it("日本語日付を検出", () => {
    expect(isDateRow("2026年3月4日")).toBe(true);
    expect(isDateRow("2026年12月31日")).toBe(true);
  });

  it("スラッシュ日付を検出", () => {
    expect(isDateRow("2026/03/04")).toBe(true);
  });

  it("通常テキストは不一致", () => {
    expect(isDateRow("おはようございます")).toBe(false);
  });

  it("日付を含むが先頭でないテキスト", () => {
    expect(isDateRow("送信日: 2026年3月4日")).toBe(false);
  });
});

describe("isSystemMessage", () => {
  it("E2EE暗号化通知", () => {
    expect(isSystemMessage("メッセージと通話はエンドツーエンドで暗号化されています")).toBe(true);
  });

  it("英語E2EE通知", () => {
    expect(isSystemMessage("Messages and calls are end-to-end encrypted")).toBe(true);
  });

  it("新しいメッセージ通知", () => {
    expect(isSystemMessage("新しいメッセージと通話はエンドツーエンド...")).toBe(true);
  });

  it("読み込み中", () => {
    expect(isSystemMessage("読み込み中...")).toBe(true);
  });

  it("通常メッセージは不一致", () => {
    expect(isSystemMessage("今日のMTGよろしくお願いします")).toBe(false);
  });
});

describe("isTimeOnlyRow", () => {
  it("時刻のみの行を検出", () => {
    expect(isTimeOnlyRow("14:30")).toBe(true);
    expect(isTimeOnlyRow("9:05")).toBe(true);
  });

  it("今日+時刻を検出", () => {
    expect(isTimeOnlyRow("今日 14:30")).toBe(true);
  });

  it("昨日+時刻を検出", () => {
    expect(isTimeOnlyRow("昨日 9:00")).toBe(true);
  });

  it("時刻+メッセージ（複数行）は不一致", () => {
    expect(isTimeOnlyRow("14:30\nこんにちは\nよろしく")).toBe(false);
  });

  it("通常テキストは不一致", () => {
    expect(isTimeOnlyRow("おはようございます")).toBe(false);
  });
});

describe("filterMessageRows", () => {
  it("日付・システム・時刻行を除去し、実メッセージのみ残す", () => {
    const rows = [
      "2026年3月4日",
      "メッセージと通話はエンドツーエンドで暗号化されています",
      "14:30",
      "こんにちは、今日のMTGの件ですが",
      "",
      "今日 9:00",
      "了解です！",
    ];
    const result = filterMessageRows(rows);
    expect(result).toEqual([
      "こんにちは、今日のMTGの件ですが",
      "了解です！",
    ]);
  });

  it("空配列は空配列を返す", () => {
    expect(filterMessageRows([])).toEqual([]);
  });

  it("全て除外対象の場合は空配列", () => {
    const rows = ["2026年3月4日", "14:30", ""];
    expect(filterMessageRows(rows)).toEqual([]);
  });
});

// ============================================================
// isE2eePlaceholder
// ============================================================
describe("isE2eePlaceholder", () => {
  it("日本語E2EEプレースホルダを検出", () => {
    expect(isE2eePlaceholder("エンドツーエンド暗号化されたチャット")).toBe(true);
  });

  it("英語E2EEプレースホルダを検出", () => {
    expect(isE2eePlaceholder("This chat is end-to-end encrypted")).toBe(true);
  });

  it("大文字小文字を区別しない", () => {
    expect(isE2eePlaceholder("END-TO-END ENCRYPTED")).toBe(true);
  });

  it("通常テキストは不一致", () => {
    expect(isE2eePlaceholder("おはようございます")).toBe(false);
  });

  it("null/undefinedでも安全", () => {
    expect(isE2eePlaceholder(null)).toBe(false);
    expect(isE2eePlaceholder(undefined)).toBe(false);
  });
});

// ============================================================
// classifyChat
// ============================================================
describe("classifyChat", () => {
  it("自分が最後に返信 → skip (already_replied)", () => {
    const result = classifyChat({ name: "Alice", preview: "あなた: 了解です", unread: true });
    expect(result.category).toBe("skip");
    expect(result.skipReasons).toContain("already_replied");
  });

  it("英語の自分返信 → skip", () => {
    const result = classifyChat({ name: "Alice", preview: "You: Got it", unread: true });
    expect(result.category).toBe("skip");
  });

  it("システムメッセージ → skip", () => {
    const result = classifyChat({ name: "Group", preview: "Aliceをグループに追加しました", unread: true });
    expect(result.category).toBe("skip");
    expect(result.skipReasons).toContain("system_message");
  });

  it("parse_error (オンライン中) → skip", () => {
    const result = classifyChat({ name: "オンライン中", preview: "some text", unread: true });
    expect(result.category).toBe("skip");
    expect(result.skipReasons).toContain("parse_error");
  });

  it("メンション → action_required", () => {
    const result = classifyChat({ name: "Group", preview: "@Tomo Mizuno 確認お願いします", unread: true });
    expect(result.category).toBe("action_required");
    expect(result.actionReasons).toContain("mentioned");
  });

  it("質問マーク → action_required", () => {
    const result = classifyChat({ name: "Alice", preview: "明日空いてる？", unread: true });
    expect(result.category).toBe("action_required");
    expect(result.actionReasons).toContain("question_or_request");
  });

  it("日程調整キーワード → action_required", () => {
    const result = classifyChat({ name: "Bob", preview: "日程調整をお願いします", unread: true });
    expect(result.category).toBe("action_required");
    expect(result.actionReasons).toContain("question_or_request");
  });

  it("E2EE未解決 → action_required (unreadable_e2ee)", () => {
    const result = classifyChat({ name: "Secret", preview: "???", unread: true, e2eeResolved: false });
    expect(result.category).toBe("action_required");
    expect(result.actionReasons).toContain("unreadable_e2ee");
  });

  it("skipとaction_requiredが両方ある場合 → action_requiredが優先", () => {
    // 「オンライン中」だけどメンションもある（仮想ケース）
    const result = classifyChat({ name: "オンライン中", preview: "@Tomo 質問です？", unread: true });
    expect(result.category).toBe("action_required");
    expect(result.skipReasons).toContain("parse_error");
    expect(result.actionReasons).toContain("mentioned");
  });

  it("どのルールにも該当しない → review", () => {
    const result = classifyChat({ name: "Alice", preview: "写真を送信しました", unread: true });
    expect(result.category).toBe("review");
    expect(result.skipReasons).toHaveLength(0);
    expect(result.actionReasons).toHaveLength(0);
  });

  it("空のプレビュー → review", () => {
    const result = classifyChat({ name: "Alice", preview: "", unread: true });
    expect(result.category).toBe("review");
  });
});

// ============================================================
// parseChatRow
// ============================================================
describe("parseChatRow", () => {
  it("正常な行をパース", () => {
    const result = parseChatRow("Alice\nHello world\nSecond line", 0, "https://www.messenger.com/t/123/", true);
    expect(result).toEqual({
      index: 0,
      name: "Alice",
      preview: "Hello world Second line",
      unread: true,
      lineCount: 3,
      threadUrl: "https://www.messenger.com/t/123/",
      threadId: "123",
      isE2ee: false,
    });
  });

  it("E2EE URLを正しくパース", () => {
    const result = parseChatRow("Bob\nEncrypted message", 1, "https://www.messenger.com/e2ee/t/456/", false);
    expect(result.isE2ee).toBe(true);
    expect(result.threadId).toBe("456");
  });

  it("空テキストはnullを返す", () => {
    expect(parseChatRow("", 0, null, false)).toBeNull();
    expect(parseChatRow("   ", 0, null, false)).toBeNull();
  });

  it("Chats/チャットヘッダーはnullを返す", () => {
    expect(parseChatRow("Chats", 0, null, false)).toBeNull();
    expect(parseChatRow("チャット", 0, null, false)).toBeNull();
  });

  it("threadUrlがnullでも安全", () => {
    const result = parseChatRow("Alice\nHello", 0, null, true);
    expect(result.threadUrl).toBeNull();
    expect(result.threadId).toBeNull();
    expect(result.isE2ee).toBe(false);
  });

  it("プレビューは150文字で切り詰め", () => {
    const longLine = "あ".repeat(200);
    const result = parseChatRow(`Alice\n${longLine}`, 0, null, false);
    expect(result.preview.length).toBeLessThanOrEqual(150);
  });

  it("名前のみ（プレビューなし）の行", () => {
    const result = parseChatRow("Alice", 0, "https://www.messenger.com/t/789/", true);
    expect(result.name).toBe("Alice");
    expect(result.preview).toBe("");
  });
});

// ============================================================
// 統合テスト: 3層dedupパイプライン
// ============================================================
describe("3層dedupパイプライン", () => {
  it("Layer1 → Layer2 を通すと全重複が除去される", () => {
    const chats = [
      // DOM入れ子で同じthreadIdが2回
      { name: "Alice", threadId: "100", preview: "hello" },
      { name: "Alice", threadId: "100", preview: "hello (nested)" },
      // threadIdなしだが名前+プレビューが同一
      { name: "オンライン中", threadId: null, preview: "some preview" },
      { name: "オンライン中", threadId: null, preview: "some preview" },
      // ユニークなエントリ
      { name: "Bob", threadId: "200", preview: "hi" },
    ];

    const afterL1 = deduplicateByThreadId(chats);
    const afterL2 = deduplicateByNamePreview(afterL1);

    expect(afterL2).toHaveLength(3); // Alice, オンライン中, Bob
  });

  it("Layer3で異なるスレッドの同一プレビューを検出", () => {
    const map = new Map();
    const preview = "先日の件について確認させてください...";

    const r1 = detectDuplicatePreview(map, preview, "thread_person_a");
    const r2 = detectDuplicatePreview(map, preview, "thread_person_b");

    expect(r1.isDuplicate).toBe(false);
    expect(r2.isDuplicate).toBe(true);
    expect(r2.existingThreadId).toBe("thread_person_a");
  });
});
