/**
 * Parallel channel fetch orchestrator with graceful degradation.
 *
 * Runs all channel fetches (email, slack, line, messenger, chatwork) in parallel
 * via Promise.allSettled. Each channel has an independent timeout and try/catch.
 * Failed channels return { channel, error, items: [] } instead of throwing.
 */

const {
  normalizeEmail,
  normalizeSlack,
  normalizeLine,
  normalizeMessenger,
  normalizeChatwork,
} = require("./schema");

// ============================================================
// Channel name display mapping
// ============================================================

const CHANNEL_DISPLAY_NAMES = {
  email: "Email",
  slack: "Slack",
  line: "LINE",
  messenger: "Messenger",
  chatwork: "Chatwork",
};

// ============================================================
// Default timeouts (ms)
// ============================================================

const DEFAULT_TIMEOUTS = {
  email: 30000,
  slack: 15000,
  line: 30000,
  messenger: 45000,
  chatwork: 30000,
};

// ============================================================
// Normalizer mapping
// ============================================================

const NORMALIZERS = {
  email: normalizeEmail,
  slack: normalizeSlack,
  line: normalizeLine,
  messenger: normalizeMessenger,
  chatwork: normalizeChatwork,
};

// ============================================================
// withTimeout
// ============================================================

/**
 * Race a promise against a timeout.
 * @param {Promise} promise - The promise to race
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} label - Channel name for error message
 * @returns {Promise} Resolves with promise result or rejects on timeout
 */
function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}: timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ============================================================
// formatWarnings
// ============================================================

/**
 * Generate briefing-ready warning strings for failed channels.
 * @param {Array<{channel: string, error: string}>} warnings
 * @returns {string[]} Formatted warning strings
 */
function formatWarnings(warnings) {
  return warnings.map((w) => {
    const displayName = CHANNEL_DISPLAY_NAMES[w.channel] || w.channel;
    return `⚠️ ${displayName}: 取得不可 (${w.error})`;
  });
}

// ============================================================
// fetchAll
// ============================================================

/**
 * Run all channel fetches in parallel with graceful degradation.
 *
 * @param {object} config
 * @param {object} config.fetchers - Map of channel name → async function returning raw data
 * @param {object} [config.timeouts] - Map of channel name → timeout in ms (overrides defaults)
 * @returns {Promise<{results: Array<{channel: string, items: Array, error?: string}>, warnings: Array<{channel: string, error: string}>}>}
 */
async function fetchAll({ fetchers, timeouts = {} }) {
  const channels = Object.keys(fetchers);
  const mergedTimeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };

  const promises = channels.map((channel) => {
    const fetcher = fetchers[channel];
    const timeout = mergedTimeouts[channel] || DEFAULT_TIMEOUTS.email; // fallback 30s
    return withTimeout(fetcher(), timeout, channel)
      .then((rawData) => {
        const normalizer = NORMALIZERS[channel];
        const items = normalizer ? normalizer(rawData) : rawData;
        return { channel, items };
      })
      .catch((err) => {
        const errorMsg = err.message || String(err);
        return { channel, items: [], error: errorMsg };
      });
  });

  const settled = await Promise.allSettled(promises);

  const results = [];
  const warnings = [];

  for (const outcome of settled) {
    // Since we catch inside each promise, all should be "fulfilled"
    const result = outcome.value;
    results.push(result);
    if (result.error) {
      warnings.push({ channel: result.channel, error: result.error });
    }
  }

  return { results, warnings };
}

module.exports = { fetchAll, withTimeout, formatWarnings };
