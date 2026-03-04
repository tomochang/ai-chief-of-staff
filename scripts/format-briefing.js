/**
 * Deterministic briefing formatter.
 *
 * Generates a Markdown briefing from classified/deduped messages,
 * calendar events, todos, and triage queue data.
 *
 * Input:  { messages, calendar, todos, triageQueue?, date }
 * Output: Markdown string matching the Step 2 template in commands/today.md
 */

// ============================================================
// Constants
// ============================================================

const CHANNEL_ORDER = ["email", "slack", "line", "messenger", "chatwork"];

const CHANNEL_LABELS = {
  email: "Email",
  slack: "Slack",
  line: "LINE",
  messenger: "Messenger",
  chatwork: "Chatwork",
};

const DAY_NAMES_JA = ["日", "月", "火", "水", "木", "金", "土"];

// Keywords that suggest an event needs preparation
const PREP_KEYWORDS = /client|customer|meeting|review|presentation|interview|pitch|demo|プレゼン|面接|面談|レビュー|顧客/i;

// ============================================================
// Helpers
// ============================================================

/**
 * Get Japanese day-of-week for a date string (YYYY-MM-DD).
 * Interprets the date in JST (UTC+9).
 * @param {string} dateStr
 * @returns {string}
 */
function getDayOfWeek(dateStr) {
  // Parse as local date parts to avoid timezone shift issues
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DAY_NAMES_JA[date.getDay()];
}

/**
 * Format a time string from an ISO datetime.
 * Extracts the local time as specified in the ISO string (e.g. +09:00 offset)
 * rather than converting to the system's local timezone.
 * @param {string} dateTime - ISO datetime string (e.g. "2026-03-04T09:00:00+09:00")
 * @returns {string} "HH:MM"
 */
function formatTime(dateTime) {
  // Extract HH:MM directly from the ISO string to preserve the original timezone
  const match = dateTime.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  // Fallback: use Date parsing (system-local)
  const d = new Date(dateTime);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Determine if a calendar event likely needs preparation.
 * @param {object} event
 * @returns {boolean}
 */
function needsPrep(event) {
  const text = `${event.summary || ""} ${event.description || ""}`;
  return PREP_KEYWORDS.test(text);
}

/**
 * Get location or link from a calendar event.
 * @param {object} event
 * @returns {string}
 */
function getLocationOrLink(event) {
  if (event.hangoutLink) return event.hangoutLink;
  if (event.conferenceData && event.conferenceData.entryPoints) {
    const video = event.conferenceData.entryPoints.find((e) => e.entryPointType === "video");
    if (video) return video.uri;
  }
  if (event.location) return event.location;
  return "—";
}

// ============================================================
// Section renderers
// ============================================================

/**
 * Render the schedule section.
 * @param {Array} calendar
 * @returns {string}
 */
function renderSchedule(calendar) {
  if (!calendar || calendar.length === 0) {
    return "## Schedule (0)\n\n予定なし\n";
  }

  // Sort events: all-day first, then by start time
  const sorted = [...calendar].sort((a, b) => {
    const aAllDay = !a.start.dateTime;
    const bAllDay = !b.start.dateTime;
    if (aAllDay && !bAllDay) return -1;
    if (!aAllDay && bAllDay) return 1;
    const aTime = a.start.dateTime || a.start.date;
    const bTime = b.start.dateTime || b.start.date;
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
  });

  const lines = [`## Schedule (${calendar.length})`, ""];
  lines.push("| Time | Event | Location/Link | Prep needed? |");
  lines.push("|------|-------|---------------|--------------|");

  for (const event of sorted) {
    let time;
    if (event.start.dateTime) {
      const startTime = formatTime(event.start.dateTime);
      const endTime = event.end && event.end.dateTime ? formatTime(event.end.dateTime) : "";
      time = endTime ? `${startTime}-${endTime}` : `${startTime}-`;
    } else {
      time = "All day";
    }

    const name = event.summary || "Untitled";
    const location = getLocationOrLink(event);
    const prep = needsPrep(event) ? "⚠️" : "—";

    lines.push(`| ${time} | ${name} | ${location} | ${prep} |`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Render cross-references for a message.
 * @param {object} message
 * @returns {string}
 */
function renderCrossRefs(message) {
  if (!message.crossRefs || message.crossRefs.length === 0) return "";

  const refs = message.crossRefs.map((ref) => {
    const label = CHANNEL_LABELS[ref.channel] || ref.channel;
    const detail = ref.preview || ref.id;
    return `${label} ${detail}`;
  });

  return `**📎 Also**: ${refs.join(", ")}\n`;
}

/**
 * Render the email channel section.
 * @param {Array} messages - email messages
 * @returns {string}
 */
function renderEmail(messages) {
  const lines = ["## Email", ""];
  const byTier = groupByTier(messages);

  // Skipped
  if (byTier.skip.length > 0) {
    lines.push(`### Skipped (${byTier.skip.length}) → auto-archived`);
    for (const m of byTier.skip) {
      const subject = (m.metadata && m.metadata.subject) || m.preview;
      lines.push(`- ${m.from.name} - ${subject}`);
    }
    lines.push("");
  }

  // Info Only
  if (byTier.info_only.length > 0) {
    lines.push(`### Info Only (${byTier.info_only.length})`);
    for (const m of byTier.info_only) {
      const subject = (m.metadata && m.metadata.subject) || m.preview;
      lines.push(`- ${m.from.name} - ${subject}`);
    }
    lines.push("");
  }

  // Meeting Info
  if (byTier.meeting_info.length > 0) {
    lines.push(`### Meeting Info (${byTier.meeting_info.length})`);
    for (const m of byTier.meeting_info) {
      const subject = (m.metadata && m.metadata.subject) || m.preview;
      lines.push(`- ${m.from.name} - ${subject}`);
    }
    lines.push("");
  }

  // Action Required
  if (byTier.action_required.length > 0) {
    lines.push(`### Action Required (${byTier.action_required.length})`);
    byTier.action_required.forEach((m, i) => {
      const email = m.from.platformId || "";
      lines.push(`#### ${i + 1}. ${m.from.name} <${email}>`);
      const subject = (m.metadata && m.metadata.subject) || "";
      if (subject) lines.push(`**Subject**: ${subject}`);
      lines.push(`**Summary**: ${m.preview}`);
      const refs = renderCrossRefs(m);
      if (refs) lines.push(refs.trimEnd());
      lines.push("");
    });
  }

  return lines.join("\n") + "\n";
}

/**
 * Render the Slack channel section.
 * Splits into Mentions (channel messages) and DMs.
 * @param {Array} messages
 * @returns {string}
 */
function renderSlack(messages) {
  const lines = ["## Slack", ""];
  const byTier = groupByTier(messages);

  // Skipped
  if (byTier.skip.length > 0) {
    lines.push(`### Skipped (${byTier.skip.length})`);
    for (const m of byTier.skip) {
      lines.push(`- ${m.from.name} - ${m.preview}`);
    }
    lines.push("");
  }

  // Split non-skip into mentions (has channelName) and DMs (no channelName)
  const nonSkip = [...byTier.info_only, ...byTier.meeting_info, ...byTier.action_required];
  const mentions = nonSkip.filter((m) => m.metadata && m.metadata.channelName);
  const dms = nonSkip.filter((m) => !m.metadata || !m.metadata.channelName);

  if (mentions.length > 0) {
    lines.push(`### Mentions (${mentions.length})`);
    mentions.forEach((m, i) => {
      const ch = m.metadata.channelName ? `#${m.metadata.channelName}` : "";
      lines.push(`${i + 1}. ${ch} ${m.from.name}: ${m.preview}`);
      const refs = renderCrossRefs(m);
      if (refs) lines.push(`   ${refs.trimEnd()}`);
    });
    lines.push("");
  }

  if (dms.length > 0) {
    lines.push(`### DMs (${dms.length})`);
    dms.forEach((m, i) => {
      lines.push(`${i + 1}. @${m.from.name}: ${m.preview}`);
      const refs = renderCrossRefs(m);
      if (refs) lines.push(`   ${refs.trimEnd()}`);
    });
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * Render LINE or Messenger channel section.
 * @param {Array} messages
 * @param {string} channelLabel
 * @returns {string}
 */
function renderLineOrMessenger(messages, channelLabel) {
  const lines = [`## ${channelLabel}`, ""];
  const byTier = groupByTier(messages);

  // Skipped
  if (byTier.skip.length > 0) {
    lines.push(`### Skipped (${byTier.skip.length})`);
    for (const m of byTier.skip) {
      lines.push(`- ${m.from.name} — ${m.preview}`);
    }
    lines.push("");
  }

  // Info Only
  if (byTier.info_only.length > 0) {
    lines.push(`### Info Only (${byTier.info_only.length})`);
    for (const m of byTier.info_only) {
      lines.push(`- ${m.from.name} — ${m.preview}`);
    }
    lines.push("");
  }

  // Meeting Info
  if (byTier.meeting_info.length > 0) {
    lines.push(`### Meeting Info (${byTier.meeting_info.length})`);
    for (const m of byTier.meeting_info) {
      lines.push(`- ${m.from.name} — ${m.preview}`);
    }
    lines.push("");
  }

  // Action Required
  if (byTier.action_required.length > 0) {
    lines.push(`### Action Required (${byTier.action_required.length})`);
    byTier.action_required.forEach((m, i) => {
      lines.push(`#### ${i + 1}. ${m.from.name}`);
      lines.push(`**Last message**: ${m.preview}`);
      const refs = renderCrossRefs(m);
      if (refs) lines.push(refs.trimEnd());
      lines.push("");
    });
  }

  return lines.join("\n") + "\n";
}

/**
 * Render the Chatwork channel section.
 * @param {Array} messages
 * @returns {string}
 */
function renderChatwork(messages) {
  const lines = ["## Chatwork", ""];
  const byTier = groupByTier(messages);

  // Skipped
  if (byTier.skip.length > 0) {
    lines.push(`### Skipped (${byTier.skip.length})`);
    for (const m of byTier.skip) {
      const room = (m.metadata && m.metadata.roomName) ? `[${m.metadata.roomName}] ` : "";
      lines.push(`- ${room}${m.from.name}: ${m.preview}`);
    }
    lines.push("");
  }

  // Action Required
  if (byTier.action_required.length > 0) {
    lines.push(`### Action Required (${byTier.action_required.length})`);
    byTier.action_required.forEach((m, i) => {
      const room = (m.metadata && m.metadata.roomName) ? `[${m.metadata.roomName}] ` : "";
      lines.push(`${i + 1}. ${room}${m.from.name}: ${m.preview}`);
      const refs = renderCrossRefs(m);
      if (refs) lines.push(`   ${refs.trimEnd()}`);
    });
    lines.push("");
  }

  // Info Only
  if (byTier.info_only.length > 0) {
    lines.push(`### Info Only (${byTier.info_only.length})`);
    byTier.info_only.forEach((m, i) => {
      const room = (m.metadata && m.metadata.roomName) ? `[${m.metadata.roomName}] ` : "";
      lines.push(`${i + 1}. ${room}${m.from.name}: ${m.preview}`);
    });
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * Render the todo section.
 * @param {Array} todos - array of { text, done } objects or plain strings
 * @returns {string}
 */
function renderTodos(todos) {
  if (!todos || todos.length === 0) return "";

  const lines = ["## Todo (today)", ""];
  for (const item of todos) {
    if (typeof item === "string") {
      lines.push(`- [ ] ${item}`);
    } else {
      const check = item.done ? "x" : " ";
      lines.push(`- [${check}] ${item.text}`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Render the triage queue section.
 * @param {object} triageQueue - { stalePending, overdueTasks, todayTasks }
 * @returns {string}
 */
function renderTriageQueue(triageQueue) {
  if (!triageQueue) return "";

  const total = (triageQueue.stalePending || 0) + (triageQueue.overdueTasks || 0) + (triageQueue.todayTasks || 0);
  const lines = ["## Triage Queue (preview)", ""];
  lines.push(`- Stale/critical pending responses: ${triageQueue.stalePending || 0}`);
  lines.push(`- Overdue tasks: ${triageQueue.overdueTasks || 0}`);
  lines.push(`- Today's tasks: ${triageQueue.todayTasks || 0}`);
  lines.push("");
  lines.push("→ Details in Step 3.");
  // Store total for footer
  lines._triageTotal = total;
  return lines.join("\n") + "\n";
}

/**
 * Render the footer line.
 * @param {Array} messages
 * @param {object} triageQueue
 * @returns {string}
 */
function renderFooter(messages, triageQueue) {
  // Count action_required by channel
  const counts = {};
  let total = 0;
  for (const ch of CHANNEL_ORDER) {
    counts[ch] = 0;
  }
  for (const m of messages) {
    if (m.tier === "action_required") {
      counts[m.channel] = (counts[m.channel] || 0) + 1;
      total++;
    }
  }

  const breakdown = CHANNEL_ORDER
    .map((ch) => `${CHANNEL_LABELS[ch]}: ${counts[ch]}`)
    .join(", ");

  let footer = `Briefing complete. ${total} action_required items (${breakdown}).`;

  if (triageQueue) {
    const triageTotal = (triageQueue.stalePending || 0) + (triageQueue.overdueTasks || 0) + (triageQueue.todayTasks || 0);
    footer += ` ${triageTotal} triage items pending decision in Step 3.`;
  }

  return footer + "\n";
}

// ============================================================
// Tier grouping helper
// ============================================================

function groupByTier(messages) {
  const groups = {
    skip: [],
    meeting_info: [],
    action_required: [],
    info_only: [],
  };
  for (const m of messages) {
    const tier = m.tier || "info_only";
    if (groups[tier]) {
      groups[tier].push(m);
    } else {
      groups.info_only.push(m);
    }
  }
  return groups;
}

// ============================================================
// Main formatter
// ============================================================

/**
 * Generate a deterministic Markdown briefing.
 *
 * @param {object} opts
 * @param {Array}  opts.messages - canonical messages with tier/reasons (post-classify, post-dedup)
 * @param {Array}  opts.calendar - Google Calendar events
 * @param {Array}  opts.todos - todo items ({ text, done } or plain strings)
 * @param {object} [opts.triageQueue] - { stalePending, overdueTasks, todayTasks }
 * @param {string} opts.date - YYYY-MM-DD date string
 * @returns {string} Markdown briefing
 */
function formatBriefing({ messages = [], calendar = [], todos = [], triageQueue, date }) {
  const day = getDayOfWeek(date);
  const sections = [];

  // Header
  sections.push(`# Today's Briefing — ${date} (${day})\n`);

  // Schedule
  sections.push(renderSchedule(calendar));

  // Group messages by channel
  const byChannel = {};
  for (const m of messages) {
    if (!byChannel[m.channel]) byChannel[m.channel] = [];
    byChannel[m.channel].push(m);
  }

  // Render each channel in order (skip channels with no messages)
  for (const ch of CHANNEL_ORDER) {
    const chMessages = byChannel[ch];
    if (!chMessages || chMessages.length === 0) continue;

    switch (ch) {
      case "email":
        sections.push(renderEmail(chMessages));
        break;
      case "slack":
        sections.push(renderSlack(chMessages));
        break;
      case "line":
        sections.push(renderLineOrMessenger(chMessages, "LINE"));
        break;
      case "messenger":
        sections.push(renderLineOrMessenger(chMessages, "Messenger"));
        break;
      case "chatwork":
        sections.push(renderChatwork(chMessages));
        break;
    }
  }

  // Todo
  const todoSection = renderTodos(todos);
  if (todoSection) sections.push(todoSection);

  // Triage Queue
  const triageSection = renderTriageQueue(triageQueue);
  if (triageSection) sections.push(triageSection);

  // Separator + Footer
  sections.push("---\n");
  sections.push(renderFooter(messages, triageQueue));

  return sections.join("\n");
}

module.exports = { formatBriefing };
