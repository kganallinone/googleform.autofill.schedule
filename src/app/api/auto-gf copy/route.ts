// src/app/api/autofill/route.ts
import { NextResponse } from "next/server";
import { chromium, Browser, Page, BrowserContext } from "playwright";

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const CONCURRENCY_LIMIT = 3;
const PAGE_TIMEOUT = 30_000;
const FORM_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const BROWSER_IDLE_MS = 30_000; // 30 seconds auto-cleanup

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

interface CacheEntry {
  data: Record<string, string>;
  expiresAt: number;
}

interface ScheduleResult {
  scheduleIndex: number;
  success: boolean;
  message: string;
  timeTaken: number;
  timeTakenFormatted: string;
  timestamp?: string;
  skippedFields?: {
    label: string;
    value: string;
    reason: string;
    availableOptions?: string[];
  }[];
  filledFields?: {
    label: string;
    value: string;
  }[];
  fieldStatuses?: {
    label: string;
    status:
      | "filled"
      | "skipped"
      | "not_found"
      | "option_not_available"
      | "field_missing"
      | "disabled"
      | "loading";
    originalValue: string;
    usedValue?: string;
    availableOptions?: string[];
  }[];
  retryCount?: number;
  errorDetails?: string;
}

interface FormStatus {
  isViewOnly: boolean;
  isSubmitted: boolean;
  message?: string;
  isLoading?: boolean;
}

interface FieldOptions {
  fieldType:
    | "radio"
    | "dropdown"
    | "checkbox"
    | "text"
    | "date"
    | "textarea"
    | "unknown";
  availableOptions: string[];
  label: string;
  isRequired: boolean;
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
 * UTILITY FUNCTIONS
 * ============================================================
 */

function formatTime(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatTimestamp(date: Date): string {
  const month = date.getMonth() + 1;
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
}

function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * ============================================================
 * BROWSER CLEANUP
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
      browserInstance = null;
      browserLaunching = null;
      console.log("✅ Browser cleaned up successfully");
    } catch (error) {
      console.warn("⚠️ Error cleaning up browser:", error);
      browserInstance = null;
      browserLaunching = null;
    }
  }
}

function resetBrowserTimeout(): void {
  if (browserIdleTimeout) {
    clearTimeout(browserIdleTimeout);
  }

  browserIdleTimeout = setTimeout(async () => {
    console.log("⏰ Browser idle timeout reached, closing...");
    await cleanupBrowser();
  }, BROWSER_IDLE_MS);
}

/**
 * ============================================================
 * GOOGLE FORM ENTRY MAP (Playwright-only, no Cheerio)
 * ============================================================
 */

async function getEntryIdMap(formUrl: string): Promise<Record<string, string>> {
  const cached = entryCache.get(formUrl);
  if (cached && cached.expiresAt > Date.now()) {
    console.log("⚡ Using cached form entry map");
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

    // Wait for the form to render
    await page
      .waitForSelector("form#mG61Hd", { timeout: 15000 })
      .catch(() =>
        console.log("⚠️ Form container not found, continuing anyway"),
      );

    const map = await page.evaluate(() => {
      const result: Record<string, string> = {};

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

      return result;
    });

    entryCache.set(formUrl, {
      data: map,
      expiresAt: Date.now() + FORM_CACHE_TTL,
    });

    console.log(`✅ Cached ${Object.keys(map).length} form fields`);
    return map;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

/**
 * ============================================================
 * FIELD OPTIONS EXTRACTION
 * ============================================================
 */

async function getFieldOptions(
  page: Page,
  labelText: string,
): Promise<FieldOptions> {
  return page.evaluate((label) => {
    const result: FieldOptions = {
      fieldType: "unknown",
      availableOptions: [],
      label: label,
      isRequired: false,
    };

    const headings = document.querySelectorAll('[role="heading"]');
    let targetContainer: Element | null = null;

    for (const heading of headings) {
      const headingText = heading.textContent?.trim() || "";
      if (headingText === label || headingText.includes(label)) {
        targetContainer = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
        if (targetContainer) break;
      }
    }

    if (!targetContainer) {
      const labels = document.querySelectorAll(
        ".freebirdFormviewerViewItemsItemItemTitle",
      );
      for (const labelEl of labels) {
        const lblText = labelEl.textContent?.trim() || "";
        if (lblText === label || lblText.includes(label)) {
          targetContainer = labelEl.closest(".geS5n, .AgroKb, .Qr7Oae");
          if (targetContainer) break;
        }
      }
    }

    if (!targetContainer) return result;

    const requiredIndicator = targetContainer.querySelector(
      '[aria-label="Required question"]',
    );
    result.isRequired = !!requiredIndicator;

    const radios = targetContainer.querySelectorAll('[role="radio"]');
    if (radios.length > 0) {
      result.fieldType = "radio";
      radios.forEach((radio) => {
        const ariaLabel = radio.getAttribute("aria-label");
        const dataValue = radio.getAttribute("data-value");
        const text = radio.textContent?.trim();
        if (ariaLabel) result.availableOptions.push(ariaLabel);
        else if (dataValue) result.availableOptions.push(dataValue);
        else if (text) result.availableOptions.push(text);
      });
      return result;
    }

    const select = targetContainer.querySelector("select");
    if (select) {
      result.fieldType = "dropdown";
      const options = Array.from(select.options);
      options.forEach((option) => {
        const text = option.textContent?.trim();
        if (text) result.availableOptions.push(text);
      });
      return result;
    }

    const checkboxes = targetContainer.querySelectorAll(
      'input[type="checkbox"]',
    );
    if (checkboxes.length > 0) {
      result.fieldType = "checkbox";
      checkboxes.forEach((checkbox) => {
        const parent = checkbox.closest("label");
        if (parent) {
          const text = parent.textContent?.trim();
          if (text) result.availableOptions.push(text);
        }
      });
      return result;
    }

    const dateInput = targetContainer.querySelector('input[type="date"]');
    if (dateInput) {
      result.fieldType = "date";
      return result;
    }

    const textarea = targetContainer.querySelector("textarea");
    if (textarea) {
      result.fieldType = "textarea";
      return result;
    }

    const textInput = targetContainer.querySelector(
      'input:not([type="hidden"])',
    );
    if (textInput) {
      result.fieldType = "text";
      return result;
    }

    return result;
  }, labelText);
}

/**
 * ============================================================
 * BROWSER MANAGEMENT - STEALTH MODE
 * ============================================================
 */

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    resetBrowserTimeout();
    return browserInstance;
  }

  if (browserLaunching) {
    return browserLaunching;
  }

  console.log("🚀 Launching Playwright browser in stealth mode...");

  browserLaunching = chromium
    .launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-features=Translate,BackForwardCache",
        "--mute-audio",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-web-security",
        "--disable-features=BlockInsecurePrivateNetworkRequests",
        "--disable-features=OutOfBlinkCors",
        "--disable-features=SameSiteByDefaultCookies",
        "--disable-features=StrictOriginIsolation",
        "--disable-features=CrossSiteDocumentBlockingAlways",
        "--disable-features=CrossSiteDocumentBlockingIfIsolating",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-sync-types",
        "--disable-translate",
        "--disable-password-manager-reauthentication",
        "--disable-password-manager",
        "--disable-client-side-phishing-detection",
      ],
    })
    .then(async (browser) => {
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

      console.log("✅ Browser ready in stealth mode");
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

/**
 * ============================================================
 * OPTIMIZED PAGE CREATION
 * ============================================================
 */

async function createOptimizedPage(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  const viewportWidth = getRandomDelay(1200, 1400);
  const viewportHeight = getRandomDelay(700, 900);

  const context = await browser.newContext({
    userAgent: randomUA,
    viewport: { width: viewportWidth, height: viewportHeight },
    locale: "en-US",
    timezoneId: "America/New_York",
    javaScriptEnabled: true,
    bypassCSP: true,
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  context.setDefaultTimeout(PAGE_TIMEOUT);
  context.setDefaultNavigationTimeout(PAGE_TIMEOUT);

  // Stealth init script
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    const originalQuery = (window.navigator.permissions as any)?.query;
    if (originalQuery) {
      (window.navigator.permissions as any).query = (parameters: any) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    }

    (window as any).chrome = {
      runtime: {},
    };
  });

  const page = await context.newPage();

  // Block heavy resources for speed
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    const blocked = ["image", "font", "media"];
    if (blocked.includes(resourceType)) {
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  return { context, page };
}

/**
 * ============================================================
 * WAIT FOR EMAIL FIELD
 * ============================================================
 */

async function waitForEmailFieldEnabled(
  page: Page,
  maxWaitTime: number = 60000,
): Promise<{ success: boolean; message: string }> {
  console.log(
    `⏳ Waiting for Email field to become interactive (max ${maxWaitTime / 1000}s)...`,
  );

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await page.evaluate(() => {
        const emailInput = document.querySelector(
          'input[type="email"]',
        ) as HTMLInputElement | null;

        if (!emailInput) {
          return {
            found: false,
            interactive: false,
            isDisabled: false,
            hasReadonly: false,
          };
        }

        if (emailInput.hasAttribute("disabled")) {
          emailInput.removeAttribute("disabled");
        }
        if (emailInput.hasAttribute("readonly")) {
          emailInput.removeAttribute("readonly");
        }

        const container = emailInput.closest(".geS5n, .AgroKb, .Qr7Oae");
        if (container) {
          if (container.hasAttribute("disabled")) {
            container.removeAttribute("disabled");
          }
          if (container.hasAttribute("aria-disabled")) {
            container.removeAttribute("aria-disabled");
          }
        }

        const isDisabled = emailInput.hasAttribute("disabled");
        const hasReadonly = emailInput.hasAttribute("readonly");
        const isInteractive = !isDisabled && !hasReadonly;

        return {
          found: true,
          interactive: isInteractive,
          isDisabled,
          hasReadonly,
        };
      });

      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      if (elapsedSeconds % 5 === 0 && elapsedSeconds > 0) {
        console.log(
          `⏳ Waiting... ${elapsedSeconds}s - Found: ${status.found}, Interactive: ${status.interactive}`,
        );
      }

      if (status.found && status.interactive) {
        console.log(
          `✅ Email field is now interactive (waited ${Math.round(
            (Date.now() - startTime) / 1000,
          )}s)`,
        );
        return { success: true, message: "Email field is interactive" };
      }

      await sleep(getRandomDelay(400, 800));
    } catch {
      await sleep(500);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`⏰ Timeout reached after ${elapsed}s`);

  return {
    success: false,
    message: `Timeout waiting for Email field to become interactive (${elapsed}s)`,
  };
}

/**
 * ============================================================
 * FILL FORM FIELD
 * ============================================================
 */

async function fillField(
  page: Page,
  labelText: string,
  valueText: string,
): Promise<{
  success: boolean;
  matchedOption?: string;
  availableOptions?: string[];
  optionNotFound?: boolean;
  isDisabled?: boolean;
}> {
  const result = await page.evaluate(
    ([label, value]) => {
      const r = {
        success: false,
        matchedOption: undefined as string | undefined,
        availableOptions: [] as string[],
        optionNotFound: false,
        isDisabled: false,
      };

      const headings = document.querySelectorAll('[role="heading"]');
      let targetContainer: Element | null = null;

      for (const heading of headings) {
        const headingText = heading.textContent?.trim() || "";
        if (headingText === label || headingText.includes(label)) {
          targetContainer = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
          if (targetContainer) break;
        }
      }

      if (!targetContainer) {
        const labels = document.querySelectorAll(
          ".freebirdFormviewerViewItemsItemItemTitle",
        );
        for (const labelEl of labels) {
          const lblText = labelEl.textContent?.trim() || "";
          if (lblText === label || lblText.includes(label)) {
            targetContainer = labelEl.closest(".geS5n, .AgroKb, .Qr7Oae");
            if (targetContainer) break;
          }
        }
      }

      if (!targetContainer) return r;

      if (targetContainer.hasAttribute("disabled")) {
        targetContainer.removeAttribute("disabled");
      }
      if (targetContainer.hasAttribute("aria-disabled")) {
        targetContainer.removeAttribute("aria-disabled");
      }

      // RADIO
      const radios = targetContainer.querySelectorAll('[role="radio"]');
      if (radios.length > 0) {
        radios.forEach((radio) => {
          const ariaLabel = radio.getAttribute("aria-label");
          const dataValue = radio.getAttribute("data-value");
          const text = radio.textContent?.trim();
          if (ariaLabel) r.availableOptions.push(ariaLabel);
          else if (dataValue) r.availableOptions.push(dataValue);
          else if (text) r.availableOptions.push(text);
        });

        for (const radio of radios) {
          const el = radio as HTMLElement;
          const ariaLabel = el.getAttribute("aria-label");
          const dataValue = el.getAttribute("data-value");

          if (ariaLabel === value || dataValue === value) {
            el.click();
            r.success = true;
            r.matchedOption = ariaLabel || dataValue || value;
            return r;
          }
        }

        for (const radio of radios) {
          const el = radio as HTMLElement;
          const ariaLabel = el.getAttribute("aria-label") || "";
          const dataValue = el.getAttribute("data-value") || "";
          if (
            ariaLabel.toLowerCase().includes(value.toLowerCase()) ||
            dataValue.toLowerCase().includes(value.toLowerCase())
          ) {
            el.click();
            r.success = true;
            r.matchedOption = ariaLabel || dataValue || value;
            return r;
          }
        }

        r.optionNotFound = true;
        return r;
      }

      // DROPDOWN
      const select = targetContainer.querySelector(
        "select",
      ) as HTMLSelectElement | null;
      if (select) {
        if (select.hasAttribute("disabled")) {
          select.removeAttribute("disabled");
        }
        const options = Array.from(select.options);
        options.forEach((opt) => {
          const text = opt.textContent?.trim();
          if (text) r.availableOptions.push(text);
        });

        for (const opt of options) {
          const optionText = opt.textContent?.trim() || "";
          const optionValue = opt.value || "";
          if (optionText === value || optionValue === value) {
            select.value = optionValue;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            select.dispatchEvent(new Event("input", { bubbles: true }));
            r.success = true;
            r.matchedOption = optionText || optionValue;
            return r;
          }
        }
        r.optionNotFound = true;
        return r;
      }

      // TEXT INPUT
      const input = targetContainer.querySelector(
        'input:not([type="hidden"])',
      ) as HTMLInputElement | null;
      if (input) {
        if (input.hasAttribute("disabled")) input.removeAttribute("disabled");
        if (input.hasAttribute("readonly")) input.removeAttribute("readonly");
        input.focus();

        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));

        if (input.value === value) {
          r.success = true;
          return r;
        }

        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.value === value) r.success = true;
        return r;
      }

      // TEXTAREA
      const textarea = targetContainer.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        if (textarea.hasAttribute("disabled"))
          textarea.removeAttribute("disabled");
        if (textarea.hasAttribute("readonly"))
          textarea.removeAttribute("readonly");
        textarea.focus();

        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        textarea.dispatchEvent(new Event("blur", { bubbles: true }));

        if (textarea.value === value) r.success = true;
        return r;
      }

      return r;
    },
    [labelText, valueText] as const,
  );

  if (!result.success && !result.optionNotFound) {
    try {
      await page.evaluate((label) => {
        const headings = document.querySelectorAll('[role="heading"]');
        let targetContainer: Element | null = null;
        for (const heading of headings) {
          const headingText = heading.textContent?.trim() || "";
          if (headingText === label || headingText.includes(label)) {
            targetContainer = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
            if (targetContainer) break;
          }
        }
        if (targetContainer) {
          const clickable = targetContainer.querySelector(
            'input, textarea, [role="radio"]',
          );
          if (clickable) (clickable as HTMLElement).click();
        }
      }, labelText);

      await sleep(getRandomDelay(200, 500));
      return await fillField(page, labelText, valueText);
    } catch (error) {
      console.warn(`⚠️ Human-like click failed for ${labelText}`);
    }
  }

  return result;
}

/**
 * ============================================================
 * CHECK FORM STATUS
 * ============================================================
 */

async function checkFormStatus(page: Page): Promise<FormStatus> {
  try {
    return await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";
      const submissionTexts = [
        "Your response has been recorded",
        "Naitala ang iyong tugon",
        "Your response has been recorded.",
        "Naitala ang iyong tugon.",
        "Response recorded",
      ];

      const isSubmitted = submissionTexts.some((text) =>
        bodyText.toLowerCase().includes(text.toLowerCase()),
      );

      if (isSubmitted) {
        return {
          isViewOnly: true,
          isSubmitted: true,
          message: "Your response has been recorded",
          isLoading: false,
        };
      }

      const thankYou = document.querySelector(
        ".freebirdFormviewerViewResponseConfirmationMessage",
      );
      if (thankYou) {
        return {
          isViewOnly: true,
          isSubmitted: true,
          message: thankYou.textContent || "Form already submitted",
          isLoading: false,
        };
      }

      return { isViewOnly: false, isSubmitted: false, isLoading: false };
    });
  } catch (error) {
    console.error("Error checking form status:", error);
    return { isViewOnly: false, isSubmitted: false, isLoading: true };
  }
}

/**
 * ============================================================
 * SUBMIT SINGLE SCHEDULE
 * ============================================================
 */

async function submitSingleSchedule(
  page: Page,
  formUrl: string,
  fields: Record<string, string>,
  scheduleIndex: number,
  retryCount: number = 0,
): Promise<ScheduleResult> {
  const startTime = Date.now();
  const submissionTime = new Date();

  try {
    console.log(
      `[Schedule ${scheduleIndex}] Loading form... (Attempt ${retryCount + 1})`,
    );

    await sleep(getRandomDelay(500, 1500));

    await page.goto(formUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT * 1.5,
    });

    await page.evaluate(() => {
      window.scrollTo(0, Math.random() * 100);
    });
    await sleep(getRandomDelay(200, 500));

    try {
      await page.waitForSelector("form#mG61Hd", { timeout: 15000 });
    } catch {
      console.log(
        `[Schedule ${scheduleIndex}] ⚠️ Form container not found, waiting longer...`,
      );
      await sleep(3000);
    }

    // Already submitted?
    const alreadySubmitted = await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";
      const submissionTexts = [
        "Your response has been recorded",
        "Naitala ang iyong tugon",
        "Your response has been recorded.",
        "Naitala ang iyong tugon.",
        "Response recorded",
        "Thank you for your response",
        "Salamat sa iyong tugon",
      ];
      const isSubmitted = submissionTexts.some((text) =>
        bodyText.toLowerCase().includes(text.toLowerCase()),
      );
      return (
        isSubmitted ||
        !!document.querySelector(
          ".freebirdFormviewerViewResponseConfirmationMessage",
        )
      );
    });

    if (alreadySubmitted) {
      const timeTaken = Date.now() - startTime;
      console.log(`[Schedule ${scheduleIndex}] ✅ Form was already submitted`);
      return {
        success: true,
        message: "Form already submitted",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
        timestamp: formatTimestamp(submissionTime),
        skippedFields: [],
        filledFields: [],
        fieldStatuses: [],
        retryCount,
      };
    }

    // Wait for email field
    console.log(
      `[Schedule ${scheduleIndex}] 🔍 Waiting for Email field to become interactive...`,
    );
    const emailResult = await waitForEmailFieldEnabled(page, 60000);

    if (!emailResult.success) {
      const timeTaken = Date.now() - startTime;

      const isSubmitted = await page.evaluate(() => {
        const bodyText = document.body?.textContent || "";
        const submissionTexts = [
          "Your response has been recorded",
          "Naitala ang iyong tugon",
          "Your response has been recorded.",
          "Naitala ang iyong tugon.",
          "Response recorded",
          "Thank you for your response",
          "Salamat sa iyong tugon",
        ];
        const isSub = submissionTexts.some((text) =>
          bodyText.toLowerCase().includes(text.toLowerCase()),
        );
        return (
          isSub ||
          !!document.querySelector(
            ".freebirdFormviewerViewResponseConfirmationMessage",
          )
        );
      });

      if (isSubmitted) {
        return {
          success: true,
          message: "Form already submitted",
          timeTaken,
          timeTakenFormatted: formatTime(timeTaken),
          scheduleIndex,
          timestamp: formatTimestamp(submissionTime),
          skippedFields: [],
          filledFields: [],
          fieldStatuses: [],
          retryCount,
        };
      }

      return {
        success: false,
        message: `❌ ${emailResult.message}`,
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
        timestamp: formatTimestamp(submissionTime),
        skippedFields: Object.entries(fields).map(([label, value]) => ({
          label,
          value: String(value),
          reason: `❌ ${emailResult.message}`,
          availableOptions: [],
        })),
        filledFields: [],
        fieldStatuses: Object.entries(fields).map(([label, value]) => ({
          label,
          status: "disabled" as const,
          originalValue: String(value),
        })),
        retryCount,
        errorDetails: emailResult.message,
      };
    }

    console.log(
      `[Schedule ${scheduleIndex}] ✅ Email field is enabled, proceeding...`,
    );

    // Process all fields
    const skippedFields: ScheduleResult["skippedFields"] = [];
    const filledFields: ScheduleResult["filledFields"] = [];
    const fieldStatuses: ScheduleResult["fieldStatuses"] = [];

    for (const [label, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      const stringValue = String(value);

      await sleep(getRandomDelay(300, 800));

      const fieldOptions = await getFieldOptions(page, label);

      if (fieldOptions.fieldType === "unknown") {
        fieldStatuses.push({
          label,
          status: "field_missing" as const,
          originalValue: stringValue,
        });
        skippedFields.push({
          label,
          value: stringValue,
          reason: `❌ FIELD MISSING: "${label}" not found in form`,
          availableOptions: [],
        });
        console.warn(
          `[Schedule ${scheduleIndex}] ❌ FIELD MISSING: "${label}"`,
        );
        continue;
      }

      if (["radio", "dropdown", "checkbox"].includes(fieldOptions.fieldType)) {
        const optionExists = fieldOptions.availableOptions.some((option) => {
          const optionLower = option.toLowerCase().trim();
          const valueLower = stringValue.toLowerCase().trim();
          return (
            optionLower === valueLower ||
            optionLower.includes(valueLower) ||
            valueLower.includes(optionLower)
          );
        });

        if (!optionExists) {
          fieldStatuses.push({
            label,
            status: "option_not_available" as const,
            originalValue: stringValue,
            availableOptions: fieldOptions.availableOptions,
          });
          skippedFields.push({
            label,
            value: stringValue,
            reason: `⚠️ OPTION NOT AVAILABLE: "${stringValue}" not found in available options [${fieldOptions.availableOptions.join(", ")}]`,
            availableOptions: fieldOptions.availableOptions,
          });
          console.warn(
            `[Schedule ${scheduleIndex}] ⚠️ OPTION NOT AVAILABLE: "${stringValue}"`,
          );
          continue;
        }
      }

      try {
        const result = await fillField(page, label, stringValue);

        if (result.isDisabled) {
          fieldStatuses.push({
            label,
            status: "disabled" as const,
            originalValue: stringValue,
          });
          skippedFields.push({
            label,
            value: stringValue,
            reason: `🔒 FIELD DISABLED: "${label}" is disabled in the form`,
            availableOptions: [],
          });
          console.warn(
            `[Schedule ${scheduleIndex}] 🔒 FIELD DISABLED: "${label}"`,
          );
          continue;
        }

        if (result.success) {
          fieldStatuses.push({
            label,
            status: "filled" as const,
            originalValue: stringValue,
            usedValue: result.matchedOption || stringValue,
          });
          filledFields.push({
            label,
            value: result.matchedOption || stringValue,
          });
          console.log(
            `[Schedule ${scheduleIndex}] ✅ FILLED: "${label}" with "${result.matchedOption || stringValue}"`,
          );
        } else if (result.optionNotFound) {
          fieldStatuses.push({
            label,
            status: "option_not_available" as const,
            originalValue: stringValue,
            availableOptions: result.availableOptions,
          });
          skippedFields.push({
            label,
            value: stringValue,
            reason: `⚠️ OPTION NOT AVAILABLE: "${stringValue}" not found in available options [${(result.availableOptions || []).join(", ")}]`,
            availableOptions: result.availableOptions,
          });
          console.warn(
            `[Schedule ${scheduleIndex}] ⚠️ OPTION NOT AVAILABLE: "${stringValue}"`,
          );
        } else {
          fieldStatuses.push({
            label,
            status: "skipped" as const,
            originalValue: stringValue,
          });
          skippedFields.push({
            label,
            value: stringValue,
            reason: `❌ FAILED TO FILL: Could not fill field "${label}"`,
            availableOptions: [],
          });
          console.warn(
            `[Schedule ${scheduleIndex}] ❌ FAILED TO FILL: "${label}"`,
          );
        }
      } catch (error) {
        fieldStatuses.push({
          label,
          status: "skipped" as const,
          originalValue: stringValue,
        });
        skippedFields.push({
          label,
          value: stringValue,
          reason: `❌ ERROR: ${error}`,
          availableOptions: [],
        });
        console.error(
          `[Schedule ${scheduleIndex}] ❌ ERROR filling ${label}:`,
          error,
        );
      }
    }

    if (skippedFields.length > 0) {
      const timeTaken = Date.now() - startTime;
      const skipMessages = skippedFields
        .map((sf) => `${sf.label}: ${sf.reason}`)
        .join("; ");

      console.log(
        `[Schedule ${scheduleIndex}] ⚠️ COMPLETED WITH SKIPS: ${skippedFields.length} field(s) skipped`,
      );

      return {
        success: false,
        message: `⚠️ ${skippedFields.length} field(s) skipped: ${skipMessages}`,
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
        timestamp: formatTimestamp(submissionTime),
        skippedFields,
        filledFields,
        fieldStatuses,
        retryCount,
      };
    }

    await sleep(getRandomDelay(500, 1500));

    console.log(
      `[Schedule ${scheduleIndex}] ✅ All fields filled, submitting...`,
    );
    await sleep(100);

    // Click submit
    let submitted = false;
    let submitAttempts = 0;

    while (!submitted && submitAttempts < 3) {
      submitted = await page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll(
            '[role="button"]:not([disabled]), button:not([disabled])',
          ),
        );
        const submitButton = buttons.find((button) => {
          const text = button.textContent?.toLowerCase() || "";
          return (
            text.includes("submit") ||
            text.includes("send") ||
            text.includes("isumite")
          );
        });
        if (!submitButton) return false;
        (submitButton as HTMLElement).click();
        return true;
      });

      if (!submitted) {
        console.log(
          `[Schedule ${scheduleIndex}] ⚠️ Submit attempt ${submitAttempts + 1} failed, retrying...`,
        );
        await sleep(500);
        submitAttempts++;
      }
    }

    if (!submitted) {
      const timeTaken = Date.now() - startTime;
      return {
        success: false,
        message: "❌ Could not find submit button after multiple attempts",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
        timestamp: formatTimestamp(submissionTime),
        skippedFields,
        filledFields,
        fieldStatuses,
        retryCount,
        errorDetails: "Submit button not found",
      };
    }

    // Wait for confirmation
    const result = await page
      .waitForFunction(
        () => {
          const text = document.body?.textContent || "";
          const submissionTexts = [
            "Your response has been recorded",
            "Naitala ang iyong tugon",
            "Your response has been recorded.",
            "Naitala ang iyong tugon.",
            "Response recorded",
            "Thank you for your response",
            "Salamat sa iyong tugon",
          ];

          for (const indicator of submissionTexts) {
            if (text.toLowerCase().includes(indicator.toLowerCase())) {
              return { success: true, message: `✅ ${indicator}` };
            }
          }

          const confirmation = document.querySelector(
            ".freebirdFormviewerViewResponseConfirmationMessage",
          );
          if (confirmation) {
            return {
              success: true,
              message:
                "✅ " +
                (confirmation.textContent || "Form submitted successfully"),
            };
          }

          const errorElements = Array.from(
            document.querySelectorAll(
              '[role="alert"], .freebirdFormviewerViewItemsItemItem',
            ),
          )
            .map((element) => element.textContent?.toLowerCase() || "")
            .join(" ");
          if (
            errorElements.includes("required") ||
            errorElements.includes("invalid")
          ) {
            return {
              success: false,
              message:
                "❌ Form validation failed - some required fields may be empty",
            };
          }
          return null;
        },
        { timeout: 15000, polling: 250 },
      )
      .catch((error: Error) => {
        console.log(
          `[Schedule ${scheduleIndex}] ⚠️ Wait for response timed out:`,
          error.message,
        );
        return null;
      });

    const timeTaken = Date.now() - startTime;

    if (!result) {
      const finalCheck = await page.evaluate(() => {
        const text = document.body?.textContent || "";
        const submissionTexts = [
          "Your response has been recorded",
          "Naitala ang iyong tugon",
          "Your response has been recorded.",
          "Naitala ang iyong tugon.",
          "Response recorded",
          "Thank you for your response",
          "Salamat sa iyong tugon",
        ];
        for (const indicator of submissionTexts) {
          if (text.toLowerCase().includes(indicator.toLowerCase())) {
            return { success: true, message: `✅ ${indicator}` };
          }
        }
        return { success: false, message: "Submission status unclear" };
      });

      if (finalCheck.success) {
        return {
          success: true,
          message: finalCheck.message,
          timeTaken,
          timeTakenFormatted: formatTime(timeTaken),
          scheduleIndex,
          timestamp: formatTimestamp(submissionTime),
          skippedFields,
          filledFields,
          fieldStatuses,
          retryCount,
        };
      }
    }

    if (result) {
      // Playwright: use jsonValue() the same way
      const data = await result.jsonValue();
      if (data && typeof data === "object" && "success" in data) {
        const typedData = data as { success: boolean; message?: string };
        return {
          success: typedData.success,
          message:
            typedData.message ||
            (typedData.success
              ? "✅ Form submitted successfully"
              : "❌ Form submission failed"),
          timeTaken,
          timeTakenFormatted: formatTime(timeTaken),
          scheduleIndex,
          timestamp: formatTimestamp(submissionTime),
          skippedFields,
          filledFields,
          fieldStatuses,
          retryCount,
        };
      }
    }

    const finalStatus = await checkFormStatus(page);
    return {
      success: finalStatus.isSubmitted,
      message: finalStatus.message || "⚠️ Submission response timeout",
      timeTaken,
      timeTakenFormatted: formatTime(timeTaken),
      scheduleIndex,
      timestamp: formatTimestamp(submissionTime),
      skippedFields,
      filledFields,
      fieldStatuses,
      retryCount,
      errorDetails: finalStatus.isSubmitted ? undefined : "Response timeout",
    };
  } catch (error: any) {
    console.error(`[Schedule ${scheduleIndex}] ❌ Error:`, error);
    const timeTaken = Date.now() - startTime;
    return {
      success: false,
      message: `❌ Error: ${error.message}`,
      timeTaken,
      timeTakenFormatted: formatTime(timeTaken),
      scheduleIndex,
      timestamp: formatTimestamp(submissionTime),
      retryCount,
      errorDetails: error.message,
    };
  }
}

/**
 * ============================================================
 * CONCURRENCY CONTROL
 * ============================================================
 */

async function processSchedulesWithLimit(
  browser: Browser,
  formUrl: string,
  schedules: Record<string, string>[],
): Promise<ScheduleResult[]> {
  const results: ScheduleResult[] = [];
  let currentIndex = 0;

  async function worker() {
    while (true) {
      const index = currentIndex++;
      if (index >= schedules.length) return;

      const { context, page } = await createOptimizedPage(browser);

      try {
        const result = await submitSingleSchedule(
          page,
          formUrl,
          schedules[index],
          index + 1,
          0,
        );

        if (result.skippedFields && result.skippedFields.length > 0) {
          console.log(
            `⚠️ [Schedule ${index + 1}] ${result.skippedFields.length} field(s) skipped`,
          );
          result.skippedFields.forEach((sf) => console.log(`   ${sf.reason}`));
        } else if (result.success) {
          console.log(`✅ [Schedule ${index + 1}] Successfully submitted`);
        } else {
          console.log(`❌ [Schedule ${index + 1}] Failed: ${result.message}`);
        }

        results.push(result);
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY_LIMIT, schedules.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results.sort((a, b) => a.scheduleIndex - b.scheduleIndex);
}

/**
 * ============================================================
 * MULTIPLE SUBMISSIONS
 * ============================================================
 */

async function submitMultipleSchedules(
  formUrl: string,
  schedules: Record<string, string>[],
) {
  const overallStartTime = Date.now();
  const browser = await getBrowser();

  try {
    const results = await processSchedulesWithLimit(
      browser,
      formUrl,
      schedules,
    );
    const totalTime = Date.now() - overallStartTime;

    const successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter(
      (r) => r.skippedFields && r.skippedFields.length > 0,
    ).length;
    const failureCount = results.filter(
      (r) => !r.success && (!r.skippedFields || r.skippedFields.length === 0),
    ).length;

    let fieldMissingCount = 0;
    let optionNotAvailableCount = 0;
    let disabledCount = 0;
    let otherSkipCount = 0;

    results.forEach((r) => {
      if (r.skippedFields) {
        r.skippedFields.forEach((sf) => {
          if (sf.reason.includes("FIELD MISSING")) fieldMissingCount++;
          else if (sf.reason.includes("OPTION NOT AVAILABLE"))
            optionNotAvailableCount++;
          else if (sf.reason.includes("DISABLED")) disabledCount++;
          else otherSkipCount++;
        });
      }
    });

    return {
      success: successCount === schedules.length,
      message: `📊 ${successCount}/${schedules.length} schedules processed (${skippedCount} with skips, ${failureCount} failed)`,
      results,
      totalTime,
      totalTimeFormatted: formatTime(totalTime),
      averageTime: schedules.length > 0 ? totalTime / schedules.length : 0,
      averageTimeFormatted:
        schedules.length > 0 ? formatTime(totalTime / schedules.length) : "0s",
      summary: {
        total: schedules.length,
        successful: successCount,
        skippedFields: skippedCount,
        failed: failureCount,
        fieldIssues: {
          fieldMissing: fieldMissingCount,
          optionNotAvailable: optionNotAvailableCount,
          disabled: disabledCount,
          other: otherSkipCount,
        },
      },
    };
  } finally {
    await cleanupBrowser();
  }
}

/**
 * ============================================================
 * SINGLE SUBMISSION
 * ============================================================
 */

async function submitSingleForm(
  formUrl: string,
  fields: Record<string, string>,
) {
  const browser = await getBrowser();
  const { context, page } = await createOptimizedPage(browser);

  try {
    return await submitSingleSchedule(page, formUrl, fields, 1, 0);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await cleanupBrowser();
  }
}

/**
 * ============================================================
 * PREFILL URL BUILDER
 * ============================================================
 */

function buildPrefilledUrl(
  baseUrl: string,
  entryMap: Record<string, string>,
  fields: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  for (const [label, value] of Object.entries(fields)) {
    const entryId = entryMap[label];
    if (entryId && value !== undefined && value !== null) {
      url.searchParams.set(entryId, String(value));
    }
  }
  return url.toString();
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

/**
 * ============================================================
 * API ROUTE
 * ============================================================
 */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { formUrl, schedules, fields, action = "prefill" } = body;

    if (!formUrl || typeof formUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid formUrl" },
        { status: 400 },
      );
    }

    // MULTIPLE SCHEDULES
    if (Array.isArray(schedules) && schedules.length > 0) {
      // FAST PREFILL MODE
      if (action !== "submit") {
        const entryMap = await getEntryIdMap(formUrl);
        const prefilledUrls = schedules.map((schedule) =>
          buildPrefilledUrl(formUrl, entryMap, schedule),
        );

        return NextResponse.json(
          {
            success: true,
            message: "✅ Pre-filled URLs created successfully",
            prefilledUrls,
            mapping: entryMap,
            schedules,
          },
          { status: 200 },
        );
      }

      // SUBMISSION MODE
      const result = await submitMultipleSchedules(formUrl, schedules);

      return NextResponse.json(
        {
          success: result.success,
          message: result.message,
          results: result.results.map((r) => ({
            scheduleIndex: r.scheduleIndex,
            success: r.success,
            message: r.message,
            timeTaken: r.timeTakenFormatted,
            timestamp: r.timestamp,
            errorDetails: r.errorDetails || undefined,
            skippedFields: r.skippedFields
              ? r.skippedFields.map((sf) => ({
                  field: sf.label,
                  requestedValue: sf.value,
                  reason: sf.reason,
                  availableOptions: sf.availableOptions || [],
                }))
              : [],
            filledFields: r.filledFields || [],
            fieldStatuses: r.fieldStatuses || [],
          })),
          summary: result.summary,
          totalTime: result.totalTimeFormatted,
          averageTime: result.averageTimeFormatted,
        },
        { status: result.success ? 200 : 207 },
      );
    }

    // SINGLE FORM
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 },
      );
    }

    // FAST PREFILL MODE
    if (action !== "submit") {
      const entryMap = await getEntryIdMap(formUrl);
      const prefilledUrl = buildPrefilledUrl(formUrl, entryMap, fields);

      return NextResponse.json(
        {
          success: true,
          message: "✅ Pre-filled URL created successfully",
          prefilledUrl,
          mapping: entryMap,
          fields,
        },
        { status: 200 },
      );
    }

    // SUBMISSION MODE
    const result = await submitSingleForm(formUrl, fields);

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        timeTaken: result.timeTakenFormatted,
        timestamp: result.timestamp,
        errorDetails: result.errorDetails || undefined,
        skippedFields: result.skippedFields
          ? result.skippedFields.map((sf) => ({
              field: sf.label,
              requestedValue: sf.value,
              reason: sf.reason,
              availableOptions: sf.availableOptions || [],
            }))
          : [],
        filledFields: result.filledFields || [],
        fieldStatuses: result.fieldStatuses || [],
      },
      { status: result.success ? 200 : 500 },
    );
  } catch (error: any) {
    console.error("❌ Error in autofill route:", error);
    await cleanupBrowser();
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process the form",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
