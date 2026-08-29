import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import puppeteer, { Browser, Page } from "puppeteer";

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const CONCURRENCY_LIMIT = 5;

const PAGE_TIMEOUT = 20_000;

const FORM_CACHE_TTL = 1000 * 60 * 60; // 1 hour

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
}

interface FormStatus {
  isViewOnly: boolean;
  isSubmitted: boolean;
  message?: string;
}

/**
 * ============================================================
 * GLOBAL CACHE
 * ============================================================
 */

const entryCache = new Map<string, CacheEntry>();

/**
 * Browser instance reused while the server instance is alive.
 */
let browserInstance: Browser | null = null;

let browserLaunching: Promise<Browser> | null = null;

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
 * PREFILLED URL
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
 * BROWSER MANAGEMENT
 * ============================================================
 */

async function getBrowser(): Promise<Browser> {
  /**
   * Reuse existing browser.
   */
  if (browserInstance?.connected) {
    return browserInstance;
  }

  /**
   * Prevent multiple simultaneous browser launches.
   */
  if (browserLaunching) {
    return browserLaunching;
  }

  console.log("🚀 Launching Puppeteer browser...");

  browserLaunching = puppeteer
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
      ],
    })
    .then((browser) => {
      browserInstance = browser;

      browser.on("disconnected", () => {
        console.warn("⚠️ Browser disconnected");

        browserInstance = null;
        browserLaunching = null;
      });

      console.log("✅ Browser ready");

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
 * PAGE OPTIMIZATION
 * ============================================================
 */

async function createOptimizedPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();

  page.setDefaultTimeout(PAGE_TIMEOUT);
  page.setDefaultNavigationTimeout(PAGE_TIMEOUT);

  await page.setViewport({
    width: 1280,
    height: 720,
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  );

  /**
   * Block unnecessary resources.
   */
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    const resourceType = request.resourceType();

    const blockedResources = ["image", "font", "media", "stylesheet"];

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
 * FORM STATUS
 * ============================================================
 */

async function checkFormStatus(page: Page): Promise<FormStatus> {
  try {
    return await page.evaluate(() => {
      const bodyText = document.body?.textContent || "";

      /**
       * Google Form success messages.
       */
      if (bodyText.includes("Your response has been recorded")) {
        return {
          isViewOnly: true,
          isSubmitted: true,
          message: "Your response has been recorded",
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
        };
      }

      return {
        isViewOnly: false,
        isSubmitted: false,
      };
    });
  } catch (error) {
    console.error("Error checking form status:", error);

    return {
      isViewOnly: false,
      isSubmitted: false,
    };
  }
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
): Promise<boolean> {
  return page.evaluate(
    (label, value) => {
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
        return false;
      }

      /**
       * RADIO BUTTON
       */
      const radios = targetContainer.querySelectorAll(
        '[role="radio"]:not([aria-disabled="true"])',
      );

      if (radios.length > 0) {
        for (const radio of radios) {
          const element = radio as HTMLElement;

          const ariaLabel = element.getAttribute("aria-label");

          const dataValue = element.getAttribute("data-value");

          if (ariaLabel === value || dataValue === value) {
            element.click();

            return true;
          }
        }

        return false;
      }

      /**
       * TEXT INPUT
       */
      const input = targetContainer.querySelector(
        'input:not([type="hidden"]):not([disabled])',
      ) as HTMLInputElement | null;

      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;

        nativeSetter?.call(input, value);

        input.dispatchEvent(new Event("input", { bubbles: true }));

        input.dispatchEvent(new Event("change", { bubbles: true }));

        input.dispatchEvent(new Event("blur", { bubbles: true }));

        return true;
      }

      /**
       * TEXTAREA
       */
      const textarea = targetContainer.querySelector(
        "textarea:not([disabled])",
      ) as HTMLTextAreaElement | null;

      if (textarea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;

        nativeSetter?.call(textarea, value);

        textarea.dispatchEvent(new Event("input", { bubbles: true }));

        textarea.dispatchEvent(new Event("change", { bubbles: true }));

        textarea.dispatchEvent(new Event("blur", { bubbles: true }));

        return true;
      }

      return false;
    },
    labelText,
    valueText,
  );
}

/**
 * ============================================================
 * SUBMIT SINGLE FORM
 * ============================================================
 */

async function submitSingleSchedule(
  page: Page,
  formUrl: string,
  fields: Record<string, string>,
  scheduleIndex: number,
): Promise<ScheduleResult> {
  const startTime = Date.now();

  try {
    console.log(`[Schedule ${scheduleIndex}] Loading form...`);

    /**
     * Faster than networkidle2.
     */
    await page.goto(formUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });

    /**
     * Wait only for the actual form.
     */
    await page.waitForSelector("form#mG61Hd", {
      timeout: 10_000,
    });

    /**
     * Check submission status.
     */
    const formStatus = await checkFormStatus(page);

    if (formStatus.isSubmitted) {
      const timeTaken = Date.now() - startTime;

      return {
        success: true,
        message: formStatus.message || "Form already submitted",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }

    if (formStatus.isViewOnly) {
      const timeTaken = Date.now() - startTime;

      return {
        success: false,
        message: formStatus.message || "Form is in view-only mode",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }

    /**
     * Fill fields.
     */
    for (const [label, value] of Object.entries(fields)) {
      if (value === undefined || value === null) {
        continue;
      }

      try {
        const filled = await fillField(page, label, String(value));

        if (!filled) {
          console.warn(`[Schedule ${scheduleIndex}] Field not found: ${label}`);
        }
      } catch (error) {
        console.error(
          `[Schedule ${scheduleIndex}] Error filling ${label}:`,
          error,
        );
      }
    }

    /**
     * Small delay only for UI event processing.
     */
    await sleep(100);

    /**
     * Click submit.
     */
    const submitted = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll(
          '[role="button"]:not([disabled]), button:not([disabled])',
        ),
      );

      const submitButton = buttons.find((button) => {
        const text = button.textContent?.toLowerCase() || "";

        return text.includes("submit") || text.includes("send");
      });

      if (!submitButton) {
        return false;
      }

      (submitButton as HTMLElement).click();

      return true;
    });

    if (!submitted) {
      const timeTaken = Date.now() - startTime;

      return {
        success: false,
        message: "Could not find submit button",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }

    /**
     * Wait for success response.
     */
    const result = await page
      .waitForFunction(
        () => {
          const text = document.body?.textContent || "";

          if (text.includes("Your response has been recorded")) {
            return {
              success: true,
              message: "Your response has been recorded",
            };
          }

          const confirmation = document.querySelector(
            ".freebirdFormviewerViewResponseConfirmationMessage",
          );

          if (confirmation) {
            return {
              success: true,
              message:
                confirmation.textContent || "Form submitted successfully",
            };
          }

          /**
           * Detect validation errors.
           */
          const errorText = Array.from(
            document.querySelectorAll(
              '[role="alert"], .freebirdFormviewerViewItemsItemItem',
            ),
          )
            .map((element) => element.textContent?.toLowerCase() || "")
            .join(" ");

          if (errorText.includes("required") || errorText.includes("invalid")) {
            return {
              success: false,
              message: "Form validation failed",
            };
          }

          return null;
        },
        {
          timeout: 12_000,
          polling: 250,
        },
      )
      .catch(() => null);

    const timeTaken = Date.now() - startTime;

    if (result) {
      const data = await result.jsonValue();

      if (data && typeof data === "object" && "success" in data) {
        const typedData = data as {
          success: boolean;
          message?: string;
        };

        return {
          success: typedData.success,
          message:
            typedData.message ||
            (typedData.success
              ? "Form submitted successfully"
              : "Form submission failed"),
          timeTaken,
          timeTakenFormatted: formatTime(timeTaken),
          scheduleIndex,
        };
      }
    }

    /**
     * Final fallback status check.
     */
    const finalStatus = await checkFormStatus(page);

    return {
      success: finalStatus.isSubmitted,
      message: finalStatus.message || "Submission response timeout",
      timeTaken,
      timeTakenFormatted: formatTime(timeTaken),
      scheduleIndex,
    };
  } catch (error: any) {
    console.error(`[Schedule ${scheduleIndex}] Error:`, error);

    const timeTaken = Date.now() - startTime;

    return {
      success: false,
      message: `Error: ${error.message}`,
      timeTaken,
      timeTakenFormatted: formatTime(timeTaken),
      scheduleIndex,
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
        );

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

  const results = await processSchedulesWithLimit(browser, formUrl, schedules);

  const totalTime = Date.now() - overallStartTime;

  const successCount = results.filter((result) => result.success).length;

  return {
    success: successCount === schedules.length,

    message: `Submitted ${successCount}/${schedules.length} schedules successfully`,

    results,

    totalTime,

    totalTimeFormatted: formatTime(totalTime),

    averageTime: schedules.length > 0 ? totalTime / schedules.length : 0,

    averageTimeFormatted:
      schedules.length > 0 ? formatTime(totalTime / schedules.length) : "0s",
  };
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
    const result = await submitSingleSchedule(page, formUrl, fields, 1);

    return result;
  } finally {
    await page.close().catch(() => {});
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

    /**
     * Validate form URL.
     */
    if (!formUrl || typeof formUrl !== "string") {
      return NextResponse.json(
        {
          error: "Missing or invalid formUrl",
        },
        { status: 400 },
      );
    }

    /**
     * ========================================================
     * MULTIPLE SCHEDULES
     * ========================================================
     */

    if (Array.isArray(schedules) && schedules.length > 0) {
      /**
       * FAST PREFILL MODE
       *
       * No Puppeteer required.
       */
      if (action !== "submit") {
        const entryMap = await getEntryIdMap(formUrl);

        const prefilledUrls = schedules.map((schedule) =>
          buildPrefilledUrl(formUrl, entryMap, schedule),
        );

        return NextResponse.json(
          {
            success: true,
            message: "Pre-filled URLs created successfully",

            prefilledUrls,

            mapping: entryMap,

            schedules,
          },
          { status: 200 },
        );
      }

      /**
       * PUPPETEER SUBMISSION MODE
       */
      const result = await submitMultipleSchedules(formUrl, schedules);

      return NextResponse.json(
        {
          success: result.success,

          message: result.message,

          results: result.results,

          totalTime: result.totalTimeFormatted,

          averageTime: result.averageTimeFormatted,
        },
        {
          status: result.success ? 200 : 207,
        },
      );
    }

    /**
     * ========================================================
     * SINGLE FORM
     * ========================================================
     */

    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return NextResponse.json(
        {
          error: "Missing or invalid fields",
        },
        { status: 400 },
      );
    }

    /**
     * FAST PREFILL MODE
     */
    if (action !== "submit") {
      const entryMap = await getEntryIdMap(formUrl);

      const prefilledUrl = buildPrefilledUrl(formUrl, entryMap, fields);

      return NextResponse.json(
        {
          success: true,

          message: "Pre-filled URL created successfully",

          prefilledUrl,

          mapping: entryMap,

          fields,
        },
        { status: 200 },
      );
    }

    /**
     * PUPPETEER SUBMISSION MODE
     */
    const result = await submitSingleForm(formUrl, fields);

    return NextResponse.json(
      {
        success: result.success,

        message: result.message,

        timeTaken: result.timeTakenFormatted,
      },
      {
        status: result.success ? 200 : 500,
      },
    );
  } catch (error: any) {
    console.error("❌ Error in autofill route:", error);

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
