/**
 * Unified message classifier for all channels.
 *
 * Applies consistent 4-tier classification rules across
 * email, slack, line, messenger, and chatwork.
 *
 * Priority: skip > meeting_info > action_required > info_only
 *
 * Input: canonical message (from schema.js)
 * Output: { tier, reasons }
 */

// ============================================================
// Pattern definitions
// ============================================================

const NOREPLY_PATTERNS = /noreply|no-reply|notification|alert|mailer-daemon|do-not-reply/i;

const BOT_DOMAINS = /@(github\.com|slack\.com|jira|notion\.so|linear\.app|vercel\.com)$/i;

const BOT_SUBJECT_TAGS = /^\[(GitHub|Slack|Jira|Linear|Notion)\]/;

const SLACK_SYSTEM_SUBTYPES = new Set([
  "bot_message",
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "reminder_add",
]);

const MESSENGER_SELF_REPLY = /^(You:|あなた:)/;

const MESSENGER_SYSTEM = /グループに追加|グループ名を|グループを作成|メッセージを削除|added|removed|named the group|created this group|deleted a message/;

const MESSENGER_PARSE_ERROR_NAMES = new Set(["Active now", "オンライン中"]);

const MEETING_URL = /https?:\/\/(zoom\.us\/j\/|teams\.microsoft\.com\/l\/meetup|meet\.google\.com\/|[\w.]+\.webex\.com\/(meet|join))/i;

const QUESTION_REQUEST_JA = /？|\?|お願い|いかがでしょう|ご確認|ご連絡|ご都合|日程|調整|ご教示|可能でしょうか|教えて/;

const QUESTION_REQUEST_EN = /please|confirm|can you|could you|let me know|thoughts\?|help|review|approve/i;

const MENTION_PATTERNS = /@Tomo|@水野|@Mizuno/;

// ============================================================
// Classification logic
// ============================================================

/**
 * Classify a canonical message into one of 4 tiers.
 * @param {object} msg - canonical message (from schema.js normalizers)
 * @returns {{ tier: string, reasons: string[] }}
 */
function classifyMessage(msg) {
  const metadata = msg.metadata || {};
  const preview = msg.preview || "";
  const fromId = (msg.from && msg.from.platformId) || "";
  const fromName = (msg.from && msg.from.name) || "";
  const channel = msg.channel || "email";

  // ---- Phase 1: SKIP ----
  const skipReasons = [];

  // Email-specific skip
  if (channel === "email") {
    if (NOREPLY_PATTERNS.test(fromId)) skipReasons.push("noreply_sender");
    if (BOT_DOMAINS.test(fromId)) skipReasons.push("bot_domain");
    if (metadata.subject && BOT_SUBJECT_TAGS.test(metadata.subject)) {
      skipReasons.push("bot_subject_tag");
    }
  }

  // Slack-specific skip
  if (channel === "slack") {
    if (metadata.isBotMessage) skipReasons.push("bot_message");
    if (metadata.subtype && SLACK_SYSTEM_SUBTYPES.has(metadata.subtype)) {
      skipReasons.push("system_event");
    }
  }

  // Messenger-specific skip
  if (channel === "messenger") {
    if (MESSENGER_SELF_REPLY.test(preview)) skipReasons.push("already_replied");
    if (MESSENGER_SYSTEM.test(preview)) skipReasons.push("system_message");
    if (MESSENGER_PARSE_ERROR_NAMES.has(fromName)) skipReasons.push("parse_error");
  }

  // Chatwork-specific skip
  if (channel === "chatwork") {
    if (metadata.roomType === "my") skipReasons.push("personal_memo");
  }

  // LINE-specific skip
  if (channel === "line") {
    if (metadata.latestSender === "self" && !metadata.needsReply) {
      skipReasons.push("self_last");
    }
  }

  if (skipReasons.length > 0) {
    return { tier: "skip", reasons: skipReasons };
  }

  // ---- Phase 2: MEETING_INFO ----
  if (MEETING_URL.test(preview)) {
    return { tier: "meeting_info", reasons: ["meeting_link"] };
  }

  // ---- Phase 3: ACTION_REQUIRED ----
  const actionReasons = [];

  // Mention patterns (messenger)
  if (MENTION_PATTERNS.test(preview)) {
    actionReasons.push("mentioned");
  }

  // Chatwork direct mention
  if (channel === "chatwork" && metadata.toMe) {
    actionReasons.push("direct_mention");
  }

  // LINE/Messenger needs_reply (DM only)
  if (channel === "line" && metadata.needsReply && metadata.roomType === "dm") {
    actionReasons.push("needs_reply");
  }

  // Messenger E2EE unresolvable
  if (channel === "messenger" && msg.isUnread && metadata.isE2ee && metadata.e2eeResolved === false) {
    actionReasons.push("unreadable_e2ee");
  }

  // Question/request keywords (universal)
  // For LINE groups, skip action_required classification
  const isGroupChat = (channel === "line" || channel === "messenger") && metadata.roomType === "group";
  if (!isGroupChat) {
    if (QUESTION_REQUEST_JA.test(preview) || QUESTION_REQUEST_EN.test(preview)) {
      actionReasons.push("question_or_request");
    }
  }

  if (actionReasons.length > 0) {
    return { tier: "action_required", reasons: actionReasons };
  }

  // ---- Phase 4: INFO_ONLY (fallback) ----
  return { tier: "info_only", reasons: [] };
}

module.exports = { classifyMessage };
