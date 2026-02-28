#!/usr/bin/env node
/**
 * Messenger Unread Check — CDP connection
 *
 * Connects to an existing headless Chrome via CDP, navigates to Messenger,
 * extracts the chat list with thread IDs, resolves E2EE preview text,
 * and classifies chats into actionRequired / review / skip.
 *
 * Output includes threadId and isE2ee per chat, enabling messenger-send-cdp.js
 * to navigate directly to the correct thread via --thread <id> [--e2ee].
 *
 * Usage:
 *   node messenger-check-cdp.js [--debug] [--port 9222]
 *
 * Options:
 *   --debug          Save debug screenshots to output/
 *   --port <number>  CDP port (default: 9222)
 *
 * Prerequisites:
 *   - npm install playwright
 *   - Headless Chrome running with --remote-debugging-port=9222
 *   - Logged in to Facebook/Messenger in that Chrome profile
 *
 * Output (JSON to stdout):
 *   {
 *     timestamp, url,
 *     summary: { total, unread, actionRequired, review, skip },
 *     actionRequired: [...],  // Chats needing a reply
 *     review: [...],          // Chats to review
 *     skip: [...]             // Auto-skippable chats
 *   }
 *
 * Each chat object includes:
 *   { name, preview, unread, threadUrl, threadId, isE2ee, category, ... }
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "output");
const DEFAULT_CDP_PORT = 9222;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    debug: false,
    port: DEFAULT_CDP_PORT,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--debug":
        opts.debug = true;
        break;
      case "--port":
        opts.port = parseInt(args[++i], 10);
        break;
    }
  }

  return opts;
}

/**
 * Dismiss dialogs and overlays that Messenger shows on load
 * (PIN recovery, E2EE restore prompts, etc.)
 */
async function dismissDialogs(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((el) => el.remove());
    document
      .querySelectorAll('[aria-modal="true"]')
      .forEach((el) => el.remove());
  });

  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('[role="button"], button');
    for (const btn of buttons) {
      const text = btn.textContent || "";
      if (
        text.includes("Not now") ||
        text.includes("Don't restore") ||
        text.includes("Continue without restoring")
      ) {
        btn.click();
        return text;
      }
    }
    const closeBtn = document.querySelector(
      '[aria-label="Close"]',
    );
    if (closeBtn) {
      closeBtn.click();
      return "close button";
    }
    return null;
  });

  if (clicked) {
    console.error("Closed dialog:", clicked);
    await page.waitForTimeout(2000);
  }
}

/**
 * Extract chat list from the Messenger sidebar.
 * Each chat includes: name, preview, unread flag, threadId, threadUrl, isE2ee.
 */
async function extractChatList(page) {
  return page.evaluate(() => {
    const results = [];
    const chatItems = document.querySelectorAll(
      '[role="row"], [role="listitem"], [data-testid*="mwthreads"]',
    );

    chatItems.forEach((item, idx) => {
      const text = item.innerText;
      if (text && text.trim().length > 0) {
        const lines = text.split("\n").filter((l) => l.trim());
        if (
          lines.length > 0 &&
          lines[0] !== "Chats" &&
          lines[0] !== "チャット"
        ) {
          // Detect unread status (bold text, blue dot, aria-label)
          const hasUnreadIndicator =
            item.querySelector(
              '[aria-label*="unread"], [aria-label*="未読"]',
            ) ||
            item.querySelector(".x1rg5ohu") ||
            (() => {
              try {
                return window.getComputedStyle(item).fontWeight >= 600;
              } catch {
                return false;
              }
            })();

          // Extract thread URL from <a> inside the row
          const linkEl = item.querySelector('a[href*="/t/"]');
          const threadUrl = linkEl ? linkEl.href : null;
          let threadId = null;
          let isE2ee = false;
          if (threadUrl) {
            const m = threadUrl.match(/\/(e2ee\/)?t\/(\d+)/);
            if (m) {
              isE2ee = !!m[1];
              threadId = m[2];
            }
          }

          results.push({
            index: idx,
            name: lines[0] || "Unknown",
            preview: lines.slice(1, 3).join(" ").substring(0, 150),
            unread: !!hasUnreadIndicator,
            lineCount: lines.length,
            threadUrl: threadUrl || null,
            threadId: threadId || null,
            isE2ee,
          });
        }
      }
    });

    return results;
  });
}

/**
 * For E2EE chats with encrypted preview text, open each chat
 * and read the actual decrypted messages.
 */
async function resolveE2eePreviews(page, allChats) {
  const E2EE_PLACEHOLDER = /end-to-end encrypted/i;
  const e2eeChats = allChats.filter(
    (c) => c.unread && E2EE_PLACEHOLDER.test(c.preview),
  );

  if (e2eeChats.length === 0) return;

  console.error(`Resolving ${e2eeChats.length} E2EE previews...`);

  // Collect chat URLs from sidebar links
  const chatLinks = await page.evaluate(() => {
    const links = {};
    const rows = document.querySelectorAll(
      '[role="row"] a[href*="/t/"], [role="listitem"] a[href*="/t/"]',
    );
    rows.forEach((a) => {
      const text =
        a.closest('[role="row"], [role="listitem"]')?.innerText?.split(
          "\n",
        )[0] || "";
      if (text) links[text] = a.href;
    });
    return links;
  });

  for (const chat of e2eeChats) {
    const chatUrl = chatLinks[chat.name];
    if (!chatUrl) {
      console.error(`  Skip ${chat.name}: no URL found`);
      continue;
    }

    try {
      console.error(`  Opening: ${chat.name}`);
      await page.goto(chatUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);

      // Dismiss dialogs
      await page.evaluate(() => {
        document
          .querySelectorAll('[role="dialog"]')
          .forEach((el) => el.remove());
        document
          .querySelectorAll('[aria-modal="true"]')
          .forEach((el) => el.remove());
      });
      await page.waitForTimeout(500);

      // Click "Restore now" button if present (E2EE message restoration)
      const restored = await page.evaluate(() => {
        const buttons = document.querySelectorAll('[role="button"], button');
        for (const btn of buttons) {
          const text = btn.textContent || "";
          if (text.includes("Restore")) {
            btn.click();
            return text;
          }
        }
        return null;
      });
      if (restored) {
        console.error(`  Clicked restore: ${restored}`);
        await page.waitForTimeout(3000);
      }

      // Scroll to bottom to show latest messages
      await page.evaluate(() => {
        const main = document.querySelector('[role="main"]');
        if (main) {
          main.scrollTop = main.scrollHeight;
          const inner = main.querySelector('[style*="overflow"]');
          if (inner) inner.scrollTop = inner.scrollHeight;
        }
      });
      await page.waitForTimeout(1500);

      // Extract latest messages from the conversation
      const messages = await page.evaluate(() => {
        const msgs = [];
        const rows = document.querySelectorAll(
          '[role="main"] [role="row"]',
        );
        const datePattern =
          /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$|^\w+ \d{1,2}, \d{4}$/;
        const systemPattern =
          /^(Messages and calls are|New messages and calls are|Loading)/;
        const timeOnlyPattern = /^(Yesterday|Today)?\s*\d{1,2}:\d{2}/;

        rows.forEach((row) => {
          const text = row.innerText ? row.innerText.trim() : "";
          if (!text || text.length === 0) return;
          const firstLine = text.split("\n")[0];
          if (datePattern.test(firstLine)) return;
          if (systemPattern.test(firstLine)) return;
          if (
            timeOnlyPattern.test(text) &&
            text.split("\n").length <= 2
          )
            return;
          msgs.push(text.substring(0, 500));
        });
        return msgs;
      });

      if (messages.length > 0) {
        const resolvedPreview = messages
          .slice(-5)
          .join("\n")
          .substring(0, 500);
        chat.preview = resolvedPreview;
        chat.e2eeResolved = true;
        console.error(
          `  Resolved (${messages.length} msgs): ${messages.slice(-1)[0].substring(0, 80)}...`,
        );
      } else {
        chat.e2eeResolved = false;
        console.error(`  No messages found for ${chat.name}`);
      }
    } catch (err) {
      console.error(`  Error resolving ${chat.name}: ${err.message}`);
      chat.e2eeResolved = false;
    }
  }

  // Navigate back to chat list
  console.error("Returning to chat list...");
  await page.goto("https://www.messenger.com/", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(2000);
}

/**
 * Classify chats into actionRequired / review / skip.
 *
 * Classification rules (customize these for your use case):
 *   - skip: already replied (preview starts with "You:"), system messages, parse errors
 *   - action_required: @mentioned, contains question/request keywords
 *   - review: everything else
 */
function classifyChats(allChats) {
  const unreadChats = allChats.filter((c) => c.unread);
  console.error(`Unread: ${unreadChats.length}`);

  const chatsToClassify =
    unreadChats.length > 0 ? unreadChats : allChats.slice(0, 30);

  const classified = chatsToClassify.map((chat) => {
    const name = chat.name || "";
    const preview = chat.preview || "";

    const skipReasons = [];
    if (preview.startsWith("You:")) skipReasons.push("already_replied");
    if (
      /added|removed|named the group|created this group|deleted a message/.test(
        preview,
      )
    )
      skipReasons.push("system_message");
    if (name === "Active now") skipReasons.push("parse_error");

    const actionReasons = [];
    // Customize: add your name patterns for @mention detection
    // if (/@YourName/.test(preview)) actionReasons.push("mentioned");
    if (/\?|please|could you|can you|let me know|confirm/.test(preview))
      actionReasons.push("question_or_request");

    // E2EE chats that couldn't be decrypted → escalate to action_required
    if (chat.unread && chat.e2eeResolved === false) {
      actionReasons.push("unreadable_e2ee");
    }

    let category = "review";
    if (skipReasons.length > 0 && actionReasons.length === 0)
      category = "skip";
    else if (actionReasons.length > 0) category = "action_required";

    return {
      ...chat,
      category,
      skipReasons,
      actionReasons,
      e2eeResolved: chat.e2eeResolved,
    };
  });

  return classified;
}

async function main() {
  const opts = parseArgs();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Verify Chrome is running on CDP port
  try {
    const resp = await fetch(`http://127.0.0.1:${opts.port}/json/version`);
    if (!resp.ok) throw new Error("CDP not ready");
  } catch {
    console.error(
      `ERROR: No Chrome on CDP port ${opts.port}. Start headless Chrome first:`,
    );
    console.error(
      `  google-chrome --headless=new --remote-debugging-port=${opts.port} --user-data-dir=/tmp/chrome-profile`,
    );
    process.exit(1);
  }

  // Connect via CDP
  console.error("Connecting via CDP...");
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${opts.port}`,
  );
  const context = browser.contexts()[0] || (await browser.newContext());

  try {
    const page = await context.newPage();

    console.error("Navigating to Messenger...");
    await page.goto("https://www.messenger.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(5000);

    // Login check
    const url = page.url();
    console.error("Current URL:", url);

    if (url.includes("login") || url.includes("checkpoint")) {
      console.error(
        "ERROR: Not logged in. Please log in to Facebook in Chrome first.",
      );
      if (opts.debug) {
        await page.screenshot({
          path: path.join(OUTPUT_DIR, "debug-login-required.png"),
        });
      }
      process.exit(1);
    }

    // Dismiss dialogs
    console.error("Closing dialogs...");
    await dismissDialogs(page);

    if (opts.debug) {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "debug-loaded.png"),
        fullPage: true,
      });
      console.error("Screenshot saved: debug-loaded.png");
    }

    // Extract chat list
    console.error("Extracting chat list...");
    const allChats = await extractChatList(page);
    console.error(`Found ${allChats.length} chats total`);

    // Resolve E2EE previews
    await resolveE2eePreviews(page, allChats);

    // Classify
    const classified = classifyChats(allChats);

    const actionRequired = classified.filter(
      (c) => c.category === "action_required",
    );
    const review = classified.filter((c) => c.category === "review");
    const skip = classified.filter((c) => c.category === "skip");

    const output = {
      timestamp: new Date().toISOString(),
      url: page.url(),
      summary: {
        total: allChats.length,
        unread: allChats.filter((c) => c.unread).length,
        actionRequired: actionRequired.length,
        review: review.length,
        skip: skip.length,
      },
      actionRequired,
      review,
      skip,
    };

    // JSON output to stdout
    console.log(JSON.stringify(output, null, 2));

    // Also save to file
    const outputFile = path.join(
      OUTPUT_DIR,
      `check-${new Date().toISOString().split("T")[0]}.json`,
    );
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.error("Saved to", outputFile);
  } catch (err) {
    console.error("Error:", err.message);
    if (opts.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    // Close messenger tabs only (don't kill the shared Chrome instance)
    try {
      const pages = context.pages();
      for (const p of pages) {
        if (
          p.url().includes("messenger.com") ||
          p.url() === "about:blank"
        ) {
          await p.close();
        }
      }
    } catch {}
  }
}

main();
