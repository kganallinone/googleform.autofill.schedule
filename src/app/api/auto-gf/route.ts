// src/app/api/autofill/route.ts
import { NextResponse } from "next/server";
import { chromium, Browser, Page, BrowserContext } from "playwright";

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const PAGE_TIMEOUT = 30_000;
const FORM_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const BROWSER_IDLE_MS = 30_000;

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

interface CacheEntry {
  data: Record<string, string>;
  expiresAt: number;
}

/**
 * ============================================================
 * GLOBAL CACHE & BROWSER MANAGEMENT
 * ============================================================
 */

const entryCache = new Map<string, CacheEntry>();
let browserInstance: Browser | null = null;
let browserLaunching: Promise<Browser> | null = null;
let browserIdleTimeout: NodeJS.Timeout | null = null;

/**
 * ============================================================
 * UTILITY
 * ============================================================
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * ============================================================
 * BROWSER MANAGEMENT
 * ============================================================
 */

async function cleanupBrowser(): Promise<void> {
  if (browserIdleTimeout) {
    clearTimeout(browserIdleTimeout);
    browserIdleTimeout = null;
  }

  if (browserInstance) {
    try {
      console.log("🧹 Cleaning up browser...");
      await browserInstance.close();
    } catch (error) {
      console.warn("⚠️ Error cleaning up browser:", error);
    } finally {
      browserInstance = null;
      browserLaunching = null;
    }
  }
}

function resetBrowserTimeout(): void {
  if (browserIdleTimeout) clearTimeout(browserIdleTimeout);

  browserIdleTimeout = setTimeout(async () => {
    console.log("⏰ Browser idle timeout reached, closing...");
    await cleanupBrowser();
  }, BROWSER_IDLE_MS);
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    resetBrowserTimeout();
    return browserInstance;
  }

  if (browserLaunching) return browserLaunching;

  console.log("🚀 Launching Playwright browser...");

  browserLaunching = chromium
    .launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ],
    })
    .then((browser) => {
      browserInstance = browser;

      browser.on("disconnected", () => {
        console.warn("⚠️ Browser disconnected");
        browserInstance = null;
        browserLaunching = null;
        if (browserIdleTimeout) {
          clearTimeout(browserIdleTimeout);
          browserIdleTimeout = null;
        }
      });

      console.log("✅ Browser ready");
      resetBrowserTimeout();
      return browser;
    })
    .catch((error) => {
      browserInstance = null;
      browserLaunching = null;
      throw error;
    });

  return browserLaunching;
}

async function createOptimizedPage(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  const context = await browser.newContext({
    userAgent: randomUA,
    viewport: {
      width: getRandomDelay(1200, 1400),
      height: getRandomDelay(700, 900),
    },
    locale: "en-US",
    timezoneId: "America/New_York",
    javaScriptEnabled: true,
  });

  context.setDefaultTimeout(PAGE_TIMEOUT);
  context.setDefaultNavigationTimeout(PAGE_TIMEOUT);

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();

  // Block heavy resources for speed
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "font", "media"].includes(type)) {
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  return { context, page };
}

/**
 * ============================================================
 * ENTRY EXTRACTION (Playwright-only)
 * ============================================================
 *
 * Extracts a map of { questionLabel -> entry.XXXXXXXXX } from
 * a Google Form.
 *
 * Strategy:
 *  1. Parse `FB_PUBLIC_LOAD_DATA_` (authoritative source).
 *  2. Fall back to scanning `input[name^="entry."]` and
 *     `[role="heading"]` pairings in the DOM.
 */

async function extractEntryMap(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const result: Record<string, string> = {};

    // --------------------------------------------------------
    // 1. Authoritative source: FB_PUBLIC_LOAD_DATA_
    // --------------------------------------------------------
    try {
      const fb = (window as any).FB_PUBLIC_LOAD_DATA_;
      const questions = fb?.[1]?.[1];

      if (Array.isArray(questions)) {
        for (const q of questions) {
          const title: string | undefined = q?.[1];
          const entryDefs: any[] | undefined = q?.[4];

          if (!title || !Array.isArray(entryDefs)) continue;

          for (const def of entryDefs) {
            const entryId = def?.[0];
            if (entryId) {
              result[title.trim()] = `entry.${entryId}`;
              break; // one entry per question is enough
            }
          }
        }
      }
    } catch (err) {
      console.warn("FB_PUBLIC_LOAD_DATA_ parse failed:", err);
    }

    // --------------------------------------------------------
    // 2. Fallback: DOM scan via headings + inputs
    // --------------------------------------------------------
    if (Object.keys(result).length === 0) {
      const headings = document.querySelectorAll('[role="heading"]');

      headings.forEach((heading) => {
        const label = heading.textContent?.trim();
        if (!label) return;

        const container = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
        if (!container) return;

        const input =
          container.querySelector<HTMLInputElement>('input[name^="entry."]') ||
          container.querySelector<HTMLInputElement>(
            'input[name$="_sentinel"]',
          ) ||
          container.querySelector<HTMLTextAreaElement>(
            'textarea[name^="entry."]',
          );

        if (!input) return;

        const name = input.getAttribute("name");
        if (!name) return;

        result[label] = name.replace("_sentinel", "");
      });
    }

    // --------------------------------------------------------
    // 3. Detect auto-collected email field
    // --------------------------------------------------------
    const emailInput = document.querySelector(
      'input[type="email"]',
    ) as HTMLInputElement | null;

    if (emailInput) {
      result["Email"] = "emailAddress";
    }

    return result;
  });
}

async function getEntryIdMap(formUrl: string): Promise<Record<string, string>> {
  const cached = entryCache.get(formUrl);
  if (cached && cached.expiresAt > Date.now()) {
    console.log("⚡ Using cached entry map");
    return cached.data;
  }

  console.log("🌐 Fetching Google Form entry map via Playwright...");

  const browser = await getBrowser();
  const { context, page } = await createOptimizedPage(browser);

  try {
    await page.goto(formUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });

    // Give the embedded script a moment to populate FB_PUBLIC_LOAD_DATA_
    await page
      .waitForSelector("form#mG61Hd", { timeout: 10000 })
      .catch(() => console.log("⚠️ Form container not found, continuing"));

    await page
      .waitForFunction(
        () => Array.isArray((window as any).FB_PUBLIC_LOAD_DATA_),
        { timeout: 5000 },
      )
      .catch(() => console.log("⚠️ FB_PUBLIC_LOAD_DATA_ not ready"));

    const map = await extractEntryMap(page);

    entryCache.set(formUrl, {
      data: map,
      expiresAt: Date.now() + FORM_CACHE_TTL,
    });

    console.log(`✅ Extracted ${Object.keys(map).length} entries`);
    return map;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

/**
 * ============================================================
 * API ROUTE
 * ============================================================
 */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { formUrl } = body;

    if (!formUrl || typeof formUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid formUrl" },
        { status: 400 },
      );
    }

    const entryMap = await getEntryIdMap(formUrl);

    // Shape the response: array of { label, entry }
    const entries = Object.entries(entryMap).map(([label, entry]) => ({
      label,
      entry,
    }));

    return NextResponse.json(
      {
        success: true,
        total: entries.length,
        entries,
        mapping: entryMap,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("❌ Error extracting entries:", error);
    await cleanupBrowser();
    return NextResponse.json(
      {
        success: false,
        error: "Failed to extract entries",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * ============================================================
 * CLEANUP ENDPOINT
 * ============================================================
 */

export async function DELETE() {
  try {
    await cleanupBrowser();
    entryCache.clear();
    return NextResponse.json({
      success: true,
      message: "Browser and cache cleaned up successfully",
    });
  } catch (error: any) {
    console.error("Error in cleanup:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
