/**
 * Cross-platform message deduplication.
 *
 * Detects and merges duplicate topics that span multiple platforms
 * (email, Slack, LINE, Messenger, Chatwork) using identity resolution,
 * keyword overlap, and shared URL detection.
 *
 * Input:  array of canonical messages (from schema.js) with tier/reasons
 * Output: deduplicated array — duplicates merged into primary with crossRefs
 */

// ============================================================
// Constants
// ============================================================

const TIER_PRIORITY = {
  action_required: 3,
  meeting_info: 2,
  info_only: 1,
  skip: 0,
};

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
  "they", "them", "their", "this", "that", "these", "those",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "up",
  "about", "into", "through", "during", "before", "after",
  "and", "but", "or", "nor", "not", "so", "yet",
  "if", "then", "else", "when", "where", "how", "what", "which", "who",
  "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "no", "only", "own", "same", "than", "too", "very",
  "just", "also", "now", "here", "there",
  "please", "hey", "hi", "hello", "thanks", "thank",
]);

const KEYWORD_OVERLAP_THRESHOLD = 0.5;
const MIN_KEYWORDS_FOR_MATCH = 3;
const TIME_WINDOW_HOURS = 24;

// ============================================================
// Identity Map
// ============================================================

/**
 * Parse relationships markdown into a person→platformIds map.
 *
 * Expected format:
 *   ### Name — Title, Company
 *   | Field | Details |
 *   | Email | addr@domain.com |
 *   | Slack | U12345 |
 *   | LINE  | LineName |
 *
 * @param {string} md - relationships markdown content
 * @returns {Map & { getByPlatformId: (id: string) => string|undefined }}
 */
function buildIdentityMap(md) {
  const map = new Map();
  const reverseIndex = new Map(); // platformId → personKey

  if (!md) return _attachReverseLookup(map, reverseIndex);

  const lines = md.split("\n");
  let currentPerson = null;

  for (const line of lines) {
    // Match ### Name — ... or ### Name (no dash)
    const headerMatch = line.match(/^###\s+(.+?)(?:\s*[—–-]\s+.*)?$/);
    if (headerMatch) {
      const name = headerMatch[1].trim();
      const key = name.toLowerCase();
      currentPerson = { name };
      map.set(key, currentPerson);
      continue;
    }

    if (!currentPerson) continue;

    // Match table rows: | Field | Value |
    const rowMatch = line.match(/^\|\s*(\w[\w\s]*?)\s*\|\s*(.+?)\s*\|/);
    if (rowMatch) {
      const field = rowMatch[1].trim().toLowerCase();
      const value = rowMatch[2].trim();

      if (field === "email" && value && !value.startsWith("[")) {
        currentPerson.email = value;
        reverseIndex.set(value, currentPerson.name.toLowerCase());
      } else if (field === "slack" && value) {
        currentPerson.slackId = value;
        reverseIndex.set(value, currentPerson.name.toLowerCase());
      } else if (field === "line" && value) {
        currentPerson.lineId = value;
        reverseIndex.set(value, currentPerson.name.toLowerCase());
      } else if (field === "messenger" && value) {
        currentPerson.messengerId = value;
        reverseIndex.set(value, currentPerson.name.toLowerCase());
      } else if (field === "chatwork" && value) {
        currentPerson.chatworkId = value;
        reverseIndex.set(value, currentPerson.name.toLowerCase());
      }
    }
  }

  return _attachReverseLookup(map, reverseIndex);
}

function _attachReverseLookup(map, reverseIndex) {
  map.getByPlatformId = (id) => reverseIndex.get(id);
  return map;
}

// ============================================================
// Keyword Extraction & Overlap
// ============================================================

/**
 * Extract keywords from text. Handles English and CJK text.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (!text) return [];

  // Split on whitespace, punctuation, and CJK/non-CJK boundaries
  const tokens = text
    .toLowerCase()
    // Insert spaces around CJK character runs to separate them from Latin text
    .replace(/([\u3000-\u9fff\uf900-\ufaff]+)/g, " $1 ")
    // Split on whitespace and common punctuation
    .split(/[\s,.:;!?()[\]{}'"<>\/\\—–\-_@#$%^&*+=|~`]+/)
    .filter((t) => t.length > 0);

  // Filter out English stopwords; keep CJK tokens and meaningful English words
  return tokens.filter((t) => {
    // Keep CJK tokens
    if (/[\u3000-\u9fff\uf900-\ufaff]/.test(t)) return true;
    // Filter English stopwords
    return !ENGLISH_STOPWORDS.has(t);
  });
}

/**
 * Compute Jaccard overlap ratio between two keyword arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0.0–1.0
 */
function keywordOverlap(a, b) {
  if (!a.length || !b.length) return 0;

  const setA = new Set(a);
  const setB = new Set(b);

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ============================================================
// URL Extraction
// ============================================================

/**
 * Extract URLs from text.
 * @param {string} text
 * @returns {string[]}
 */
function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g);
  return matches || [];
}

// ============================================================
// Time Window
// ============================================================

/**
 * Check if two timestamps are within a time window.
 * @param {string} ts1 - ISO timestamp
 * @param {string} ts2 - ISO timestamp
 * @param {number} hours - window size in hours (default 24)
 * @returns {boolean}
 */
function withinTimeWindow(ts1, ts2, hours = TIME_WINDOW_HOURS) {
  const d1 = new Date(ts1).getTime();
  const d2 = new Date(ts2).getTime();
  return Math.abs(d1 - d2) <= hours * 60 * 60 * 1000;
}

// ============================================================
// Topic Matching
// ============================================================

/**
 * Determine if two messages are about the same topic.
 * Uses keyword overlap and shared URL detection.
 * @param {object} msgA
 * @param {object} msgB
 * @returns {boolean}
 */
function isSameTopic(msgA, msgB) {
  // Check shared URLs first — strongest signal
  const urlsA = extractUrls(msgA.preview);
  const urlsB = extractUrls(msgB.preview);
  if (urlsA.length > 0 && urlsB.length > 0) {
    const urlSetB = new Set(urlsB);
    for (const url of urlsA) {
      if (urlSetB.has(url)) return true;
    }
  }

  // Check keyword overlap
  const kwA = extractKeywords(msgA.preview);
  const kwB = extractKeywords(msgB.preview);

  // Guard: too few keywords → skip keyword matching to avoid false positives
  if (kwA.length < MIN_KEYWORDS_FOR_MATCH || kwB.length < MIN_KEYWORDS_FOR_MATCH) {
    return false;
  }

  return keywordOverlap(kwA, kwB) >= KEYWORD_OVERLAP_THRESHOLD;
}

// ============================================================
// Person Resolution
// ============================================================

/**
 * Resolve the person key for a message using identity map + name fallback.
 * @param {object} msg - canonical message with from.name, from.platformId
 * @param {Map} identityMap
 * @returns {string} person key (lowercase name or resolved identity)
 */
function resolvePersonKey(msg, identityMap) {
  const platformId = msg.from && msg.from.platformId;
  if (platformId && identityMap.getByPlatformId) {
    const resolved = identityMap.getByPlatformId(platformId);
    if (resolved) return resolved;
  }

  // Fallback: use from.name lowercased
  return (msg.from && msg.from.name || "unknown").toLowerCase();
}

// ============================================================
// Main Dedup Logic
// ============================================================

/**
 * Deduplicate messages across platforms.
 *
 * @param {Array} messages - canonical messages with tier/reasons
 * @param {Map} identityMap - from buildIdentityMap()
 * @returns {Array} deduplicated messages with crossRefs on merged entries
 */
function deduplicateMessages(messages, identityMap) {
  if (!messages || messages.length === 0) return [];

  // Separate skip messages — they are never dedup candidates
  const skipMessages = [];
  const candidates = [];
  for (const msg of messages) {
    if (msg.tier === "skip") {
      skipMessages.push(msg);
    } else {
      candidates.push(msg);
    }
  }

  // Group candidates by resolved person
  const personGroups = new Map();
  for (const msg of candidates) {
    const personKey = resolvePersonKey(msg, identityMap);
    if (!personGroups.has(personKey)) {
      personGroups.set(personKey, []);
    }
    personGroups.get(personKey).push(msg);
  }

  // Within each person group, find same-topic clusters
  const merged = new Set(); // IDs of messages that got merged into another
  const results = [];

  for (const [, group] of personGroups) {
    if (group.length <= 1) {
      results.push(...group);
      continue;
    }

    // Build clusters of same-topic messages within time window
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < group.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [group[i]];
      assigned.add(i);

      for (let j = i + 1; j < group.length; j++) {
        if (assigned.has(j)) continue;

        // Must be within time window AND same topic
        if (
          withinTimeWindow(group[i].timestamp, group[j].timestamp) &&
          isSameTopic(group[i], group[j])
        ) {
          cluster.push(group[j]);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    // Merge each cluster
    for (const cluster of clusters) {
      if (cluster.length === 1) {
        results.push(cluster[0]);
        continue;
      }

      // Pick primary: highest tier wins; if tie, the one with action_required reasons
      // (platform with direct question/request)
      cluster.sort((a, b) => {
        const tierDiff = (TIER_PRIORITY[b.tier] || 0) - (TIER_PRIORITY[a.tier] || 0);
        if (tierDiff !== 0) return tierDiff;
        // If same tier, earlier message wins
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      const primary = { ...cluster[0] };
      primary.crossRefs = cluster.slice(1).map((secondary) => ({
        channel: secondary.channel,
        id: secondary.id,
        preview: secondary.preview,
      }));

      // Tier promotion: use the highest tier across the cluster
      for (const m of cluster) {
        if ((TIER_PRIORITY[m.tier] || 0) > (TIER_PRIORITY[primary.tier] || 0)) {
          primary.tier = m.tier;
          primary.reasons = m.reasons;
        }
      }

      results.push(primary);
    }
  }

  // Return skip messages + deduped results (preserving relative order)
  const allIds = messages.map((m) => m.id);
  const resultMap = new Map();
  for (const msg of [...skipMessages, ...results]) {
    resultMap.set(msg.id, msg);
  }

  // Return in original order (skip messages stay in place, deduped results replace primaries)
  const output = [];
  const seen = new Set();
  for (const id of allIds) {
    if (seen.has(id)) continue;
    const msg = resultMap.get(id);
    if (msg) {
      output.push(msg);
      seen.add(id);
      // Also mark cross-ref IDs as seen
      if (msg.crossRefs) {
        for (const ref of msg.crossRefs) {
          seen.add(ref.id);
        }
      }
    }
  }

  return output;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  buildIdentityMap,
  deduplicateMessages,
  extractKeywords,
  keywordOverlap,
  extractUrls,
  withinTimeWindow,
};
