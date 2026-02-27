#!/usr/bin/env node
/**
 * Messenger送信スクリプト — CDP接続 + keyboard.type() 方式
 *
 * 既存のheadless Chrome（port 9222）にCDP接続してメッセージ送信する。
 * E2EE (暗号化) チャットでは execCommand/fill() が効かないため、
 * keyboard.type() + Shift+Enter で入力する。
 *
 * Usage:
 *   node messenger-send-cdp.js --to "相手名" --message "了解です！"
 *   node messenger-send-cdp.js --thread <threadId> --message "了解です！"
 *   node messenger-send-cdp.js --to "相手名" --message "1行目\n2行目" --dry-run
 *
 * Options:
 *   --to <name>         宛先の名前（検索で使用）
 *   --thread <id>       E2EEスレッドID（URLの末尾の数字。--toより優先）
 *   --message <text>    送信メッセージ（\n で改行）
 *   --dry-run           入力まで行うが送信しない
 *   --debug             デバッグスクリーンショット保存
 *   --port <number>     CDP port（デフォルト: 9222）
 *   --timeout <ms>      各ステップのタイムアウト（デフォルト: 10000）
 *
 * Prerequisites:
 *   - npm install playwright (in this directory)
 *   - headless Chrome running with --remote-debugging-port=9222
 *   - Logged in to Facebook/Messenger
 *
 * Technical Notes:
 *   - Messenger E2EE's contenteditable textbox is React-managed
 *   - document.execCommand('insertText') does NOT work (React ignores it)
 *   - playwright's fill() also fails for the same reason
 *   - keyboard.type() sends OS-level input events that React catches correctly
 *   - Overlays must be force-dismissed before interacting with the textbox
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "output");
const DEFAULT_CDP_PORT = 9222;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    to: null,
    thread: null,
    message: null,
    dryRun: false,
    debug: false,
    port: DEFAULT_CDP_PORT,
    timeout: 10000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--to":
        opts.to = args[++i];
        break;
      case "--thread":
        opts.thread = args[++i];
        break;
      case "--message":
        opts.message = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--debug":
        opts.debug = true;
        break;
      case "--port":
        opts.port = parseInt(args[++i], 10);
        break;
      case "--timeout":
        opts.timeout = parseInt(args[++i], 10);
        break;
    }
  }

  if (!opts.message || (!opts.to && !opts.thread)) {
    console.error(
      'Usage: node messenger-send-cdp.js --to "名前" --message "メッセージ"',
    );
    console.error(
      '       node messenger-send-cdp.js --thread <threadId> --message "メッセージ"',
    );
    process.exit(1);
  }

  return opts;
}

/**
 * Remove overlays that block textbox interaction.
 * Messenger frequently shows dialogs (PIN recovery, E2E notices, etc.)
 * that intercept pointer events.
 */
async function dismissOverlays(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    // Remove dialog elements
    document.querySelectorAll('[role="dialog"]').forEach((el) => el.remove());
    document
      .querySelectorAll('[aria-modal="true"]')
      .forEach((el) => el.remove());

    // Hide fixed-position high-z-index overlays (preserve textbox containers)
    document.querySelectorAll("div").forEach((el) => {
      const s = getComputedStyle(el);
      if (
        s.position === "fixed" &&
        parseInt(s.zIndex) > 100 &&
        el.offsetHeight > 100
      ) {
        if (!el.querySelector('[role="textbox"]')) {
          el.style.display = "none";
        }
      }
    });

    // Click dismiss buttons if present
    const buttons = document.querySelectorAll('[role="button"], button');
    for (const btn of buttons) {
      const text = btn.textContent || "";
      if (
        text.includes("復元しない") ||
        text.includes("Not now") ||
        text.includes("後で")
      ) {
        btn.click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);
}

/**
 * Navigate to chat — either by thread ID (direct URL) or search.
 * Thread ID is more reliable for known contacts.
 */
async function navigateToThread(page, opts) {
  if (opts.thread) {
    const url = `https://www.messenger.com/e2ee/t/${opts.thread}`;
    console.error(`Navigating to thread: ${url}`);

    if (!page.url().includes(opts.thread)) {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(3000);
    }
    return true;
  }

  // Search-based navigation
  console.error(`Searching for: ${opts.to}`);

  const searchInput = page
    .locator(
      '[placeholder*="Messenger"], [placeholder*="検索"], [aria-label*="検索"]',
    )
    .first();

  if ((await searchInput.count()) === 0) {
    console.error("Search box not found");
    return false;
  }

  await searchInput.click({ force: true });
  await page.waitForTimeout(500);
  await searchInput.fill(opts.to);
  await page.waitForTimeout(2000);

  const searchResult = page
    .locator(
      `[role="listitem"]:has-text("${opts.to}"), [role="row"]:has-text("${opts.to}"), [role="option"]:has-text("${opts.to}")`,
    )
    .first();

  if ((await searchResult.count()) > 0) {
    await searchResult.click();
  } else {
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(2000);
  return true;
}

/**
 * Type message using keyboard.type() — the only method that works
 * with E2EE React-managed contenteditable textboxes.
 *
 * \\n in the message string becomes Shift+Enter (newline without sending).
 * Plain Enter sends the message.
 */
async function typeMessage(page, message, timeout) {
  const textbox = await page.waitForSelector(
    '[role="textbox"][contenteditable="true"]',
    { timeout },
  );

  if (!textbox) {
    console.error("Textbox not found");
    return false;
  }

  // Force click bypasses overlays that intercept pointer events
  await textbox.click({ force: true });
  await page.waitForTimeout(500);

  // Split by literal \n and type with Shift+Enter for newlines
  const lines = message.split("\\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) {
      await page.keyboard.type(lines[i], { delay: 15 });
    }
    if (i < lines.length - 1) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
    }
  }

  await page.waitForTimeout(300);

  // Verify text was actually entered
  const content = await page.evaluate(() => {
    const input = document.querySelector(
      '[role="textbox"][contenteditable="true"]',
    );
    return input ? input.innerText.trim() : "";
  });

  if (!content || content.length < 1) {
    console.error("Text entry verification failed — textbox is empty");
    return false;
  }

  console.error(`Verified: "${content.substring(0, 80)}..."`);
  return true;
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

  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const pages = context.pages();

    // Find existing messenger page or create new one
    let page = pages.find((p) => p.url().includes("messenger.com"));

    if (!page) {
      console.error("No messenger page found, creating one...");
      page = await context.newPage();
      await page.goto("https://www.messenger.com/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }

    // Login check
    if (page.url().includes("login") || page.url().includes("checkpoint")) {
      console.error("ERROR: Not logged in to Facebook/Messenger");
      process.exit(1);
    }

    console.error("Page:", page.url());

    // Dismiss overlays
    await dismissOverlays(page);

    if (opts.debug) {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "send-debug-1-before-nav.png"),
      });
    }

    // Navigate to chat
    const navigated = await navigateToThread(page, opts);
    if (!navigated) {
      console.error("Failed to navigate to chat");
      process.exit(1);
    }

    // Dismiss overlays again (navigation can trigger new ones)
    await dismissOverlays(page);

    if (opts.debug) {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "send-debug-2-chat-opened.png"),
      });
    }

    // Type message
    console.error("Typing message...");
    const typed = await typeMessage(page, opts.message, opts.timeout);

    if (!typed) {
      console.error("Failed to type message");
      if (opts.debug) {
        await page.screenshot({
          path: path.join(OUTPUT_DIR, "send-debug-error-type.png"),
        });
      }
      process.exit(1);
    }

    if (opts.debug) {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "send-debug-3-typed.png"),
      });
    }

    // Send or dry-run
    if (opts.dryRun) {
      console.error("DRY RUN — message typed but not sent");
      console.log(
        JSON.stringify({
          success: true,
          dryRun: true,
          recipient: opts.to || opts.thread,
          message: opts.message,
        }),
      );
    } else {
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);

      console.error("Message sent!");
      console.log(
        JSON.stringify({
          success: true,
          recipient: opts.to || opts.thread,
          message: opts.message,
        }),
      );

      if (opts.debug) {
        await page.screenshot({
          path: path.join(OUTPUT_DIR, "send-debug-4-sent.png"),
        });
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
    if (opts.debug) console.error(err.stack);
    process.exit(1);
  }
  // Note: Don't close browser — we're sharing the existing Chrome instance
}

main();
