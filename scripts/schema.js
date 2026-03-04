/**
 * Canonical message schema for cross-channel normalization.
 *
 * All channels (email, slack, line, messenger, chatwork) normalize
 * their output into this common format before classification/dedup.
 */

const VALID_CHANNELS = ["email", "slack", "line", "messenger", "chatwork"];

// ============================================================
// Validation
// ============================================================

/**
 * Validate a canonical message object.
 * @param {object} msg
 * @returns {string[]} array of error strings (empty = valid)
 */
function validateMessage(msg) {
  const errors = [];
  if (!msg.id) errors.push("id is required");
  if (!msg.channel) {
    errors.push("channel is required");
  } else if (!VALID_CHANNELS.includes(msg.channel)) {
    errors.push(`channel must be one of: ${VALID_CHANNELS.join(", ")}`);
  }
  if (!msg.from) {
    errors.push("from is required");
  } else if (!msg.from.name) {
    errors.push("from.name is required");
  }
  if (!msg.timestamp) errors.push("timestamp is required");
  if (!msg.preview && msg.preview !== "") errors.push("preview is required");
  return errors;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Parse "Name <email>" or just "email" from email From header.
 * @param {string} header
 * @returns {{ name: string, email: string }}
 */
function parseFromHeader(header) {
  if (!header) return { name: "Unknown", email: "" };
  // "Name <email>" or '"Name" <email>'
  const m = header.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  // plain email
  return { name: header.trim(), email: header.trim() };
}

/**
 * Convert Unix milliseconds string to ISO timestamp.
 * @param {string|number} ms
 * @returns {string}
 */
function msToISO(ms) {
  return new Date(Number(ms)).toISOString();
}

/**
 * Convert Slack ts (seconds.microseconds) to ISO timestamp.
 * @param {string} ts
 * @returns {string}
 */
function slackTsToISO(ts) {
  return new Date(parseFloat(ts) * 1000).toISOString();
}

/**
 * Convert Unix seconds to ISO timestamp.
 * @param {number} seconds
 * @returns {string}
 */
function unixToISO(seconds) {
  return new Date(seconds * 1000).toISOString();
}

// ============================================================
// Normalizers
// ============================================================

/**
 * Normalize Messenger chat list output to canonical format.
 * @param {Array} chats - output from messenger-check-cdp.js
 * @returns {Array} canonical messages
 */
function normalizeMessenger(chats) {
  return chats.map((chat) => ({
    id: `messenger:${chat.threadId || `idx_${chat.index}`}`,
    channel: "messenger",
    from: {
      name: chat.name || "Unknown",
      platformId: chat.threadId || `idx_${chat.index}`,
    },
    timestamp: new Date().toISOString(), // Messenger doesn't expose timestamps in chat list
    preview: chat.preview || "",
    threadId: chat.threadId || null,
    isUnread: !!chat.unread,
    metadata: {
      isE2ee: !!chat.isE2ee,
      e2eeResolved: chat.e2eeResolved,
      threadUrl: chat.threadUrl || null,
      lineCount: chat.lineCount,
      originalCategory: chat.category,
      skipReasons: chat.skipReasons,
      actionReasons: chat.actionReasons,
    },
  }));
}

/**
 * Normalize gog gmail search --json output to canonical format.
 * @param {Array} emails - array of email message objects
 * @returns {Array} canonical messages
 */
function normalizeEmail(emails) {
  return emails.map((email) => {
    const { name, email: addr } = parseFromHeader(email.headerFrom);
    const labels = email.labelIds || [];
    return {
      id: `email:${email.id}`,
      channel: "email",
      from: {
        name,
        platformId: addr,
      },
      timestamp: email.internalDate ? msToISO(email.internalDate) : new Date().toISOString(),
      preview: email.snippet || "",
      threadId: email.threadId || email.id,
      isUnread: labels.includes("UNREAD"),
      metadata: {
        subject: email.subject || "",
        headerTo: email.headerTo || "",
        headerCc: email.headerCc || "",
        labelIds: labels,
      },
    };
  });
}

/**
 * Normalize Slack MCP message output to canonical format.
 * @param {Array} messages - slack message objects (enriched with channel_name, user_name, user_real_name)
 * @returns {Array} canonical messages
 */
function normalizeSlack(messages) {
  return messages.map((msg) => ({
    id: `slack:${msg.ts}`,
    channel: "slack",
    from: {
      name: msg.user_real_name || msg.user_name || msg.user || "Unknown",
      platformId: msg.user || "",
    },
    timestamp: slackTsToISO(msg.ts),
    preview: (msg.text || "").substring(0, 300),
    threadId: msg.thread_ts || msg.ts,
    isUnread: true, // Slack messages fetched by triage are typically unread context
    metadata: {
      channelId: msg.channel || "",
      channelName: msg.channel_name || "",
      isBotMessage: !!(msg.bot_id || msg.subtype === "bot_message"),
      subtype: msg.subtype || null,
      threadTs: msg.thread_ts || null,
      reactions: msg.reactions || [],
    },
  }));
}

/**
 * Normalize LINE sync output (Matrix bridge) to canonical format.
 * @param {Array} rooms - output from line-sync.sh --json
 * @returns {Array} canonical messages
 */
function normalizeLine(rooms) {
  return rooms.map((room) => ({
    id: `line:${room.room_id}`,
    channel: "line",
    from: {
      name: room.room_name || "Unknown",
      platformId: room.room_id,
    },
    timestamp: room.latest_ts || new Date().toISOString(),
    preview: room.latest_body || "",
    threadId: room.room_id,
    isUnread: room.latest_sender === "other" || !!room.needs_reply,
    metadata: {
      roomType: room.type || "dm",
      needsReply: !!room.needs_reply,
      latestSender: room.latest_sender || "unknown",
    },
  }));
}

/**
 * Normalize Chatwork fetch output to canonical format.
 * @param {Array} rooms - output from chatwork-fetch.sh (room objects with messages)
 * @returns {Array} canonical messages
 */
function normalizeChatwork(rooms) {
  const results = [];
  for (const room of rooms) {
    // Skip personal memo rooms
    if (room.room_type === "my") continue;
    // Skip rooms with no messages
    if (!room.messages || room.messages.length === 0) continue;

    // Find latest message from someone else, or fall back to latest overall
    const otherMsgs = room.messages.filter((m) => !m.is_mine);
    const latestMsg =
      otherMsgs.length > 0
        ? otherMsgs[otherMsgs.length - 1]
        : room.messages[room.messages.length - 1];

    results.push({
      id: `chatwork:${room.room_id}:${latestMsg.message_id}`,
      channel: "chatwork",
      from: {
        name: latestMsg.account_name || "Unknown",
        platformId: String(latestMsg.account_id),
      },
      timestamp: unixToISO(latestMsg.send_time),
      preview: (latestMsg.body || "").substring(0, 300),
      threadId: String(room.room_id),
      isUnread: !latestMsg.is_mine && room.unread_num > 0,
      metadata: {
        roomType: room.room_type,
        roomName: room.room_name,
        unreadCount: room.unread_num || 0,
        mentionCount: room.mention_num || 0,
        needsAction: !!room.needs_action,
        toMe: !!latestMsg.to_me,
      },
    });
  }
  return results;
}

module.exports = {
  VALID_CHANNELS,
  validateMessage,
  normalizeMessenger,
  normalizeEmail,
  normalizeSlack,
  normalizeLine,
  normalizeChatwork,
};
