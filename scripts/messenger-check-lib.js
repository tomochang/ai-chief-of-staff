/**
 * Messenger checker の純粋関数群
 * local-check.js から抽出。ブラウザ依存なし。
 */

// --- URL / ThreadId ---

/**
 * MessengerのURLからthreadIdとE2EEフラグを抽出
 * @param {string|null} url
 * @returns {{ threadId: string|null, isE2ee: boolean }}
 */
function extractThreadInfo(url) {
  if (!url) return { threadId: null, isE2ee: false };
  const m = url.match(/\/(e2ee\/)?t\/(\d+)/);
  if (!m) return { threadId: null, isE2ee: false };
  return { threadId: m[2], isE2ee: !!m[1] };
}

// --- Deduplication ---

/**
 * threadIdベースの重複除去（Layer 1）
 * DOMの入れ子構造で同じスレッドが複数回取得される場合の対策
 * @param {Array} chats
 * @returns {Array}
 */
function deduplicateByThreadId(chats) {
  const seen = new Set();
  const result = [];
  for (const chat of chats) {
    if (chat.threadId) {
      if (seen.has(chat.threadId)) continue;
      seen.add(chat.threadId);
    }
    result.push(chat);
  }
  return result;
}

/**
 * 名前+プレビューベースの重複除去（Layer 2）
 * threadIdがnullのエントリ向け
 * @param {Array} chats
 * @returns {Array}
 */
function deduplicateByNamePreview(chats) {
  const seen = new Set();
  const result = [];
  for (const chat of chats) {
    const key = `${chat.name}::${(chat.preview || "").substring(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chat);
  }
  return result;
}

/**
 * E2EE解決後の重複検出（Layer 3）
 * 同じプレビューが別スレッドで解決されていたら重複とみなす
 * @param {Map} resolvedPreviews - preview先頭100文字 → threadId
 * @param {string} previewText
 * @param {string} threadId
 * @returns {{ isDuplicate: boolean, existingThreadId: string|null }}
 */
function detectDuplicatePreview(resolvedPreviews, previewText, threadId) {
  const key = (previewText || "").substring(0, 100);
  const existing = resolvedPreviews.get(key);
  if (existing && existing !== threadId) {
    return { isDuplicate: true, existingThreadId: existing };
  }
  resolvedPreviews.set(key, threadId);
  return { isDuplicate: false, existingThreadId: null };
}

// --- Message Filtering ---

const DATE_PATTERN = /^\d{4}年\d{1,2}月\d{1,2}日$|^\d{4}\/\d{2}\/\d{2}/;
const SYSTEM_PATTERN = /^(メッセージと通話は|Messages and calls are|新しいメッセージと通話は|読み込み中)/;
const TIME_ONLY_PATTERN = /^(昨日|今日|一昨日)?\s*\d{1,2}:\d{2}/;

function isDateRow(text) {
  return DATE_PATTERN.test(text.split("\n")[0]);
}

function isSystemMessage(text) {
  return SYSTEM_PATTERN.test(text.split("\n")[0]);
}

function isTimeOnlyRow(text) {
  return TIME_ONLY_PATTERN.test(text) && text.split("\n").length <= 2;
}

/**
 * メッセージ行のフィルタリング（日付・システム・時刻のみの行を除去）
 * @param {string[]} rows - innerTextの配列
 * @returns {string[]}
 */
function filterMessageRows(rows) {
  return rows.filter((text) => {
    if (!text || text.trim().length === 0) return false;
    if (isDateRow(text)) return false;
    if (isSystemMessage(text)) return false;
    if (isTimeOnlyRow(text)) return false;
    return true;
  });
}

// --- E2EE Detection ---

const E2EE_PLACEHOLDER = /エンドツーエンド暗号化|end-to-end encrypted/i;

function isE2eePlaceholder(preview) {
  return E2EE_PLACEHOLDER.test(preview || "");
}

// --- Classification ---

/**
 * チャットを分類する
 * @param {{ name: string, preview: string, unread: boolean, e2eeResolved?: boolean }} chat
 * @returns {{ category: string, skipReasons: string[], actionReasons: string[] }}
 */
function classifyChat(chat) {
  const name = chat.name || "";
  const preview = chat.preview || "";

  const skipReasons = [];
  if (preview.startsWith("あなた:") || preview.startsWith("You:")) skipReasons.push("already_replied");
  if (/グループに追加|グループ名を|グループを作成|メッセージを削除|added|removed|named the group/.test(preview)) skipReasons.push("system_message");
  if (name === "オンライン中" || name === "Active now") skipReasons.push("parse_error");

  const actionReasons = [];
  if (/@Tomo|@水野|@Mizuno/.test(preview)) actionReasons.push("mentioned");
  if (/？|\?|お願い|いかがでしょう|ご確認|ご連絡|ご都合|日程|調整/.test(preview)) actionReasons.push("question_or_request");
  if (chat.unread && chat.e2eeResolved === false) actionReasons.push("unreadable_e2ee");

  let category = "review";
  if (skipReasons.length > 0 && actionReasons.length === 0) category = "skip";
  else if (actionReasons.length > 0) category = "action_required";

  return { category, skipReasons, actionReasons };
}

// --- Chat Row Parsing ---

/**
 * DOM行テキストからチャット情報を解析
 * @param {string} text - innerText
 * @param {number} index
 * @param {string|null} threadUrl
 * @param {boolean} hasUnreadIndicator
 * @returns {object|null}
 */
function parseChatRow(text, index, threadUrl, hasUnreadIndicator) {
  if (!text || text.trim().length === 0) return null;
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;
  if (lines[0] === "Chats" || lines[0] === "チャット") return null;

  const { threadId, isE2ee } = extractThreadInfo(threadUrl);

  return {
    index,
    name: lines[0] || "Unknown",
    preview: lines.slice(1, 3).join(" ").substring(0, 150),
    unread: !!hasUnreadIndicator,
    lineCount: lines.length,
    threadUrl: threadUrl || null,
    threadId,
    isE2ee,
  };
}

module.exports = {
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
};
