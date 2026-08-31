import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import puppeteer, { Browser, Page } from "puppeteer";

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const CONCURRENCY_LIMIT = 3; // Reduced to avoid detection
const PAGE_TIMEOUT = 30_000;
const FORM_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_RETRIES = 2;
const RETRY_DELAY = 3000;
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
 * GOOGLE FORM ENTRY MAP
 * ============================================================
 */

async function getEntryIdMap(formUrl: string): Promise<Record<string, string>> {
  const cached = entryCache.get(formUrl);
  if (cached && cached.expiresAt > Date.now()) {
    console.log("⚡ Using cached form entry map");
    return cached.data;
  }

  console.log("🌐 Fetching Google Form entry map...");

  const response = await fetch(formUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch form: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const map: Record<string, string> = {};

  $('[role="heading"]').each((_, element) => {
    const heading = $(element);
    const label = heading.text().trim();
    if (!label) return;

    const container = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
    if (!container.length) return;

    let input = container.find('input[name^="entry."]').first();
    if (!input.length) {
      input = container.find('input[name$="_sentinel"]').first();
    }
    if (!input.length) {
      input = container.find('textarea[name^="entry."]').first();
    }
    if (!input.length) return;

    const name = input.attr("name");
    if (!name) return;

    const entryId = name.replace("_sentinel", "");
    map[label] = entryId;
  });

  entryCache.set(formUrl, {
    data: map,
    expiresAt: Date.now() + FORM_CACHE_TTL,
  });

  console.log(`✅ Cached ${Object.keys(map).length} form fields`);
  return map;
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

    // Find the container by label
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
      // Try alternative label selectors
      const labels = document.querySelectorAll(
        ".freebirdFormviewerViewItemsItemItemTitle",
      );
      for (const labelEl of labels) {
        const labelText = labelEl.textContent?.trim() || "";
        if (labelText === label || labelText.includes(label)) {
          targetContainer = labelEl.closest(".geS5n, .AgroKb, .Qr7Oae");
          if (targetContainer) break;
        }
      }
    }

    if (!targetContainer) return result;

    // Check if required
    const requiredIndicator = targetContainer.querySelector(
      '[aria-label="Required question"]',
    );
    result.isRequired = !!requiredIndicator;

    // Check for radio buttons
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

    // Check for dropdown/select
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

    // Check for checkboxes
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

    // Check for date input
    const dateInput = targetContainer.querySelector('input[type="date"]');
    if (dateInput) {
      result.fieldType = "date";
      return result;
    }

    // Check for textarea
    const textarea = targetContainer.querySelector("textarea");
    if (textarea) {
      result.fieldType = "textarea";
      return result;
    }

    // Check for text input
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
  if (browserInstance?.connected) {
    resetBrowserTimeout();
    return browserInstance;
  }

  if (browserLaunching) {
    return browserLaunching;
  }

  console.log("🚀 Launching Puppeteer browser in stealth mode...");

  browserLaunching = puppeteer
    .launch({
      headless: true, // Modern headless mode for server
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
        // Stealth mode arguments to avoid detection
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

      // Remove webdriver property from all pages
      const pages = await browser.pages();
      for (const page of pages) {
        await page.evaluateOnNewDocument(() => {
          // Remove webdriver property
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });

          // Override navigator properties
          Object.defineProperty(navigator, "plugins", {
            get: () => [1, 2, 3, 4, 5],
          });

          Object.defineProperty(navigator, "languages", {
            get: () => ["en-US", "en"],
          });

          // Override permissions
          Object.defineProperty(navigator, "permissions", {
            get: () => ({
              query: () => Promise.resolve({ state: "granted" }),
            }),
          });

          // Add chrome property to window
          (window as any).chrome = {
            runtime: {},
          };
        });
      }

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

async function createOptimizedPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();

  page.setDefaultTimeout(PAGE_TIMEOUT);
  page.setDefaultNavigationTimeout(PAGE_TIMEOUT);

  // Random viewport to avoid fingerprinting
  const viewportWidth = getRandomDelay(1200, 1400);
  const viewportHeight = getRandomDelay(700, 900);
  await page.setViewport({
    width: viewportWidth,
    height: viewportHeight,
  });

  // Random user agent
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
  await page.setUserAgent(randomUA);

  // Set extra headers to look like a real browser
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
  });

  // Remove webdriver property on this page too
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    (window as any).chrome = {
      runtime: {},
    };
  });

  // Block only heavy resources
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const resourceType = request.resourceType();
    const blockedResources = ["image", "font", "media"];
    if (blockedResources.includes(resourceType)) {
      request.abort().catch(() => {});
    } else {
      request.continue().catch(() => {});
    }
  });

  return page;
}

/**
 * ============================================================
 * WAIT FOR EMAIL FIELD - WITH STEALTH CHECKS
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
      // Check the email field status and try to enable it
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

        // Try to remove disabled and readonly attributes
        if (emailInput.hasAttribute("disabled")) {
          emailInput.removeAttribute("disabled");
        }
        if (emailInput.hasAttribute("readonly")) {
          emailInput.removeAttribute("readonly");
        }

        // Try to remove disabled from container
        const container = emailInput.closest(".geS5n, .AgroKb, .Qr7Oae");
        if (container) {
          if (container.hasAttribute("disabled")) {
            container.removeAttribute("disabled");
          }
          if (container.hasAttribute("aria-disabled")) {
            container.removeAttribute("aria-disabled");
          }
        }

        // Check if field is now interactive
        const isDisabled = emailInput.hasAttribute("disabled");
        const hasReadonly = emailInput.hasAttribute("readonly");
        const isInteractive = !isDisabled && !hasReadonly;

        return {
          found: true,
          interactive: isInteractive,
          isDisabled: isDisabled,
          hasReadonly: hasReadonly,
        };
      });

      // Log progress every 5 seconds
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      if (elapsedSeconds % 5 === 0 && elapsedSeconds > 0) {
        console.log(
          `⏳ Waiting... ${elapsedSeconds}s - Found: ${status.found}, Interactive: ${status.interactive}`,
        );
      }

      if (status.found && status.interactive) {
        console.log(
          `✅ Email field is now interactive (waited ${Math.round((Date.now() - startTime) / 1000)}s)`,
        );
        return {
          success: true,
          message: "Email field is interactive",
        };
      }

      // Random delay between checks to look human
      await sleep(getRandomDelay(400, 800));
    } catch (error) {
      await sleep(500);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `⏰ Timeout reached after ${elapsed}s - Email field not interactive`,
  );

  return {
    success: false,
    message: `Timeout waiting for Email field to become interactive (${elapsed}s)`,
  };
}

/**
 * ============================================================
 * FILL FORM FIELD WITH STEALTH - HUMAN-LIKE TYPING
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
    (label, value) => {
      const result = {
        success: false,
        matchedOption: undefined as string | undefined,
        availableOptions: [] as string[],
        optionNotFound: false,
        isDisabled: false,
      };

      // Find container
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
          const labelText = labelEl.textContent?.trim() || "";
          if (labelText === label || labelText.includes(label)) {
            targetContainer = labelEl.closest(".geS5n, .AgroKb, .Qr7Oae");
            if (targetContainer) break;
          }
        }
      }

      if (!targetContainer) {
        return result;
      }

      // Force remove disabled attributes from container
      if (targetContainer.hasAttribute("disabled")) {
        targetContainer.removeAttribute("disabled");
      }
      if (targetContainer.hasAttribute("aria-disabled")) {
        targetContainer.removeAttribute("aria-disabled");
      }

      // RADIO BUTTONS
      const radios = targetContainer.querySelectorAll('[role="radio"]');
      if (radios.length > 0) {
        radios.forEach((radio) => {
          const ariaLabel = radio.getAttribute("aria-label");
          const dataValue = radio.getAttribute("data-value");
          const text = radio.textContent?.trim();
          if (ariaLabel) result.availableOptions.push(ariaLabel);
          else if (dataValue) result.availableOptions.push(dataValue);
          else if (text) result.availableOptions.push(text);
        });

        for (const radio of radios) {
          const element = radio as HTMLElement;
          const ariaLabel = element.getAttribute("aria-label");
          const dataValue = element.getAttribute("data-value");

          if (ariaLabel === value || dataValue === value) {
            element.click();
            result.success = true;
            result.matchedOption = ariaLabel || dataValue || value;
            return result;
          }
        }

        for (const radio of radios) {
          const element = radio as HTMLElement;
          const ariaLabel = element.getAttribute("aria-label") || "";
          const dataValue = element.getAttribute("data-value") || "";

          if (
            ariaLabel.toLowerCase().includes(value.toLowerCase()) ||
            dataValue.toLowerCase().includes(value.toLowerCase())
          ) {
            element.click();
            result.success = true;
            result.matchedOption = ariaLabel || dataValue || value;
            return result;
          }
        }

        result.optionNotFound = true;
        return result;
      }

      // DROPDOWN / SELECT
      const select = targetContainer.querySelector(
        "select",
      ) as HTMLSelectElement | null;
      if (select) {
        if (select.hasAttribute("disabled")) {
          select.removeAttribute("disabled");
        }

        const options = Array.from(select.options);
        options.forEach((option) => {
          const text = option.textContent?.trim();
          if (text) result.availableOptions.push(text);
        });

        for (const option of options) {
          const optionText = option.textContent?.trim() || "";
          const optionValue = option.value || "";

          if (optionText === value || optionValue === value) {
            select.value = optionValue;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            select.dispatchEvent(new Event("input", { bubbles: true }));
            result.success = true;
            result.matchedOption = optionText || optionValue;
            return result;
          }
        }

        result.optionNotFound = true;
        return result;
      }

      // TEXT INPUT
      const input = targetContainer.querySelector(
        'input:not([type="hidden"])',
      ) as HTMLInputElement | null;
      if (input) {
        if (input.hasAttribute("disabled")) {
          input.removeAttribute("disabled");
        }
        if (input.hasAttribute("readonly")) {
          input.removeAttribute("readonly");
        }

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
          result.success = true;
          return result;
        }

        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        if (input.value === value) {
          result.success = true;
        }
        return result;
      }

      // TEXTAREA
      const textarea = targetContainer.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        if (textarea.hasAttribute("disabled")) {
          textarea.removeAttribute("disabled");
        }
        if (textarea.hasAttribute("readonly")) {
          textarea.removeAttribute("readonly");
        }

        textarea.focus();

        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        textarea.dispatchEvent(new Event("blur", { bubbles: true }));

        if (textarea.value === value) {
          result.success = true;
        }
        return result;
      }

      return result;
    },
    labelText,
    valueText,
  );

  // If the field was disabled, try a human-like approach
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
          if (clickable) {
            (clickable as HTMLElement).click();
          }
        }
      }, labelText);

      await sleep(getRandomDelay(200, 500));

      // Try filling again
      return await fillField(page, labelText, valueText);
    } catch (error) {
      console.warn(`⚠️ Human-like click failed for ${labelText}`);
    }
  }

  return result;
}

/**
 * ============================================================
 * CHECK IF FORM IS SUBMITTED
 * ============================================================
 */

async function checkFormStatus(page: Page): Promise<FormStatus> {
  try {
    return await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";

      // Check for submission indicators (English and Filipino)
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

      return {
        isViewOnly: false,
        isSubmitted: false,
        isLoading: false,
      };
    });
  } catch (error) {
    console.error("Error checking form status:", error);
    return {
      isViewOnly: false,
      isSubmitted: false,
      isLoading: true,
    };
  }
}

/**
 * ============================================================
 * SUBMIT SINGLE SCHEDULE - WITH STEALTH
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

    // Add random delay before navigation
    await sleep(getRandomDelay(500, 1500));

    // Navigate with stealth
    await page.goto(formUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT * 1.5,
    });

    // Random scroll to look human
    await page.evaluate(() => {
      window.scrollTo(0, Math.random() * 100);
    });
    await sleep(getRandomDelay(200, 500));

    // Wait for form container
    try {
      await page.waitForSelector("form#mG61Hd", {
        timeout: 15000,
      });
    } catch (error) {
      console.log(
        `[Schedule ${scheduleIndex}] ⚠️ Form container not found, waiting longer...`,
      );
      await sleep(3000);
    }

    // Check if already submitted (in case form was already filled)
    const alreadySubmitted = await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";

      // Check for submission indicators (English and Filipino)
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

    // Wait for Email field to become interactive
    console.log(
      `[Schedule ${scheduleIndex}] 🔍 Waiting for Email field to become interactive...`,
    );
    const emailResult = await waitForEmailFieldEnabled(page, 60000);

    if (!emailResult.success) {
      const timeTaken = Date.now() - startTime;

      // Check again if form is already submitted
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

    // Check if already submitted
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

    if (isSubmitted) {
      const timeTaken = Date.now() - startTime;
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

    // Process all fields with human-like delays
    const skippedFields: ScheduleResult["skippedFields"] = [];
    const filledFields: ScheduleResult["filledFields"] = [];
    const fieldStatuses: ScheduleResult["fieldStatuses"] = [];

    for (const [label, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;

      const stringValue = String(value);

      // Random delay between fields (human-like)
      await sleep(getRandomDelay(300, 800));

      // Get field options and type
      const fieldOptions = await getFieldOptions(page, label);

      // If field not found, skip it
      if (fieldOptions.fieldType === "unknown") {
        const status = {
          label,
          status: "field_missing" as const,
          originalValue: stringValue,
        };
        fieldStatuses.push(status);
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

      // For fields with options (radio, dropdown, checkbox)
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
          const status = {
            label,
            status: "option_not_available" as const,
            originalValue: stringValue,
            availableOptions: fieldOptions.availableOptions,
          };
          fieldStatuses.push(status);
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

      // Try to fill the field
      try {
        const result = await fillField(page, label, stringValue);

        if (result.isDisabled) {
          const status = {
            label,
            status: "disabled" as const,
            originalValue: stringValue,
          };
          fieldStatuses.push(status);
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
          const status = {
            label,
            status: "filled" as const,
            originalValue: stringValue,
            usedValue: result.matchedOption || stringValue,
          };
          fieldStatuses.push(status);
          filledFields.push({
            label,
            value: result.matchedOption || stringValue,
          });
          console.log(
            `[Schedule ${scheduleIndex}] ✅ FILLED: "${label}" with "${result.matchedOption || stringValue}"`,
          );
        } else if (result.optionNotFound) {
          const status = {
            label,
            status: "option_not_available" as const,
            originalValue: stringValue,
            availableOptions: result.availableOptions,
          };
          fieldStatuses.push(status);
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
          const status = {
            label,
            status: "skipped" as const,
            originalValue: stringValue,
          };
          fieldStatuses.push(status);
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
        const status = {
          label,
          status: "skipped" as const,
          originalValue: stringValue,
        };
        fieldStatuses.push(status);
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

    // Check if there were any skipped fields
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

    // Random delay before submit (human-like)
    await sleep(getRandomDelay(500, 1500));

    // Submit the form
    console.log(
      `[Schedule ${scheduleIndex}] ✅ All fields filled, submitting...`,
    );
    await sleep(100);

    // Find and click submit button with retry logic
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
        if (!submitButton) {
          return false;
        }
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

    // Wait for success response with longer timeout
    const result = await page
      .waitForFunction(
        () => {
          const text = document.body?.textContent || "";

          // Check for submission indicators (English and Filipino)
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
              return {
                success: true,
                message: `✅ ${indicator}`,
              };
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
        {
          timeout: 15000,
          polling: 250,
        },
      )
      .catch((error) => {
        console.log(
          `[Schedule ${scheduleIndex}] ⚠️ Wait for response timed out:`,
          error.message,
        );
        return null;
      });

    const timeTaken = Date.now() - startTime;

    // If waitForFunction didn't catch it, check one more time
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

    // Final fallback status check
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
      if (index >= schedules.length) {
        return;
      }

      const page = await createOptimizedPage(browser);

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
          result.skippedFields.forEach((sf) => {
            console.log(`   ${sf.reason}`);
          });
        } else if (result.success) {
          console.log(`✅ [Schedule ${index + 1}] Successfully submitted`);
        } else {
          console.log(`❌ [Schedule ${index + 1}] Failed: ${result.message}`);
        }

        results.push(result);
      } finally {
        await page.close().catch(() => {});
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

    const successCount = results.filter((result) => result.success).length;
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
    // Clean up browser after all submissions
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
  const page = await createOptimizedPage(browser);

  try {
    const result = await submitSingleSchedule(page, formUrl, fields, 1, 0);
    return result;
  } finally {
    await page.close().catch(() => {});
    // Clean up browser after single submission
    await cleanupBrowser();
  }
}

/**
 * ============================================================
 * HELPER FUNCTION FOR PREFILL URL
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
      {
        success: false,
        error: error.message,
      },
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
        {
          error: "Missing or invalid formUrl",
        },
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

      // PUPPETEER SUBMISSION MODE
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
        {
          status: result.success ? 200 : 207,
        },
      );
    }

    // SINGLE FORM
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return NextResponse.json(
        {
          error: "Missing or invalid fields",
        },
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

    // PUPPETEER SUBMISSION MODE
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
      {
        status: result.success ? 200 : 500,
      },
    );
  } catch (error: any) {
    console.error("❌ Error in autofill route:", error);
    // Clean up browser on error
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
