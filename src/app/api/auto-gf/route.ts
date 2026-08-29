import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

// In-memory cache: formUrl -> entryMap
const cache = new Map<string, Record<string, string>>();

async function getEntryIdMap(formUrl: string): Promise<Record<string, string>> {
  if (cache.has(formUrl)) {
    return cache.get(formUrl)!;
  }

  const response = await fetch(formUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch form: ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const map: Record<string, string> = {};

  // Find all question headings with role="heading"
  $('[role="heading"]').each((i, el) => {
    const heading = $(el);
    const label = heading.text().trim();
    if (!label) return;

    // Find the closest container that contains the input
    const container = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
    if (!container.length) return;

    // Try to find an input with name starting with "entry."
    let input = container.find('input[name^="entry."]').first();
    if (!input.length) {
      // For radio groups, there's a hidden input with name ending with "_sentinel"
      input = container.find('input[name$="_sentinel"]').first();
    }
    if (!input.length) {
      // For textareas
      input = container.find('textarea[name^="entry."]').first();
    }
    if (input.length) {
      const name = input.attr("name");
      if (name) {
        // Remove "_sentinel" suffix if present
        const entryId = name.replace("_sentinel", "");
        map[label] = entryId;
      }
    }
  });

  cache.set(formUrl, map);
  return map;
}

function buildPrefilledUrl(
  baseUrl: string,
  entryMap: Record<string, string>,
  fields: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  for (const [label, value] of Object.entries(fields)) {
    const entryId = entryMap[label];
    if (entryId) {
      url.searchParams.append(entryId, value);
    }
  }
  return url.toString();
}

function formatTime(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(2) + "s";
}

// Define the result type
interface ScheduleResult {
  scheduleIndex: number;
  success: boolean;
  message: string;
  timeTaken: number;
  timeTakenFormatted: string;
}

async function checkFormStatus(
  page: any,
): Promise<{ isViewOnly: boolean; isSubmitted: boolean; message?: string }> {
  try {
    // Check if form is in view-only mode (already submitted)
    const status = await page.evaluate(() => {
      // Check for thank you message
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

      // Check for "Your response has been recorded" text
      const responseRecorded = document.body.textContent?.includes(
        "Your response has been recorded",
      );
      if (responseRecorded) {
        return {
          isViewOnly: true,
          isSubmitted: true,
          message: "Your response has been recorded",
        };
      }

      // Check if form is in view mode (all fields disabled)
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]), textarea',
      );
      let allDisabled = true;

      for (const input of inputs) {
        if (
          !input.hasAttribute("disabled") &&
          !input.hasAttribute("aria-disabled")
        ) {
          allDisabled = false;
          break;
        }
      }

      if (allDisabled && inputs.length > 0) {
        return {
          isViewOnly: true,
          isSubmitted: false,
          message: "Form is in view-only mode",
        };
      }

      return {
        isViewOnly: false,
        isSubmitted: false,
      };
    });

    return status;
  } catch (error) {
    console.error("Error checking form status:", error);
    return { isViewOnly: false, isSubmitted: false };
  }
}

async function submitSingleScheduleInTab(
  page: any,
  formUrl: string,
  fields: Record<string, string>,
  scheduleIndex: number,
): Promise<ScheduleResult> {
  const startTime = Date.now();

  try {
    console.log(`[Schedule ${scheduleIndex}] Navigating to form...`);
    await page.goto(formUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Check if form is already submitted or in view-only mode
    const formStatus = await checkFormStatus(page);

    // If the form shows "Your response has been recorded", consider it a SUCCESS
    // This means the form was already successfully submitted previously
    if (
      formStatus.isSubmitted &&
      formStatus.message?.includes("Your response has been recorded")
    ) {
      console.log(
        `[Schedule ${scheduleIndex}] ✅ Form already has a recorded response (treating as success)`,
      );
      const timeTaken = Date.now() - startTime;
      return {
        success: true, // Treat as success
        message: `Form already has a recorded response (previous submission successful)`,
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }

    // If form is in view-only mode for other reasons, treat as error
    if (formStatus.isViewOnly) {
      console.log(`[Schedule ${scheduleIndex}] Form is in view-only mode`);
      const timeTaken = Date.now() - startTime;
      return {
        success: false,
        message: `Form is in view-only mode. Please use a fresh form URL.`,
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }

    await page.waitForSelector("form#mG61Hd", { timeout: 10000 });
    console.log(`[Schedule ${scheduleIndex}] Form loaded successfully`);

    // Fill in the fields
    for (const [label, value] of Object.entries(fields)) {
      console.log(
        `[Schedule ${scheduleIndex}] Filling field: "${label}" = "${value}"`,
      );

      try {
        const fieldFilled = await page.evaluate(
          (labelText: string, valueText: string) => {
            // Find the question container by heading text
            const allHeadings = document.querySelectorAll('[role="heading"]');
            let targetContainer: Element | null = null;

            // Find the heading that matches
            for (const heading of allHeadings) {
              const headingText = heading.textContent?.trim() || "";
              if (
                headingText === labelText ||
                headingText.includes(labelText)
              ) {
                targetContainer = heading.closest(".geS5n, .AgroKb, .Qr7Oae");
                if (targetContainer) {
                  break;
                }
              }
            }

            if (!targetContainer) {
              console.log(`Could not find container for: ${labelText}`);
              return false;
            }

            // Check if this is a radio group - look for the sentinel input
            const sentinelInput = targetContainer.querySelector(
              'input[name$="_sentinel"]',
            );
            if (sentinelInput) {
              console.log(`Found radio group for: ${labelText}`);

              // Find all radio buttons in this container
              const radioButtons = targetContainer.querySelectorAll(
                '[role="radio"]:not([aria-disabled="true"])',
              );
              console.log(`Found ${radioButtons.length} radio buttons`);

              for (const radio of radioButtons) {
                const radioEl = radio as HTMLElement;

                // Check by aria-label (most reliable)
                const ariaLabel = radioEl.getAttribute("aria-label");
                console.log(
                  `Checking radio: aria-label="${ariaLabel}", data-value="${radioEl.getAttribute("data-value")}"`,
                );

                // Check if this radio button matches the value we want
                if (
                  ariaLabel === valueText ||
                  radioEl.getAttribute("data-value") === valueText
                ) {
                  console.log(`✅ Clicking radio: ${ariaLabel}`);
                  radioEl.click();

                  // Trigger change event on the sentinel input
                  if (sentinelInput) {
                    sentinelInput.dispatchEvent(
                      new Event("change", { bubbles: true }),
                    );
                  }

                  return true;
                }
              }

              console.log(`❌ Could not find radio option: ${valueText}`);
              return false;
            }

            // Check for text input
            const textInput = targetContainer.querySelector(
              'input:not([type="hidden"]):not([disabled])',
            ) as HTMLInputElement | null;
            if (textInput) {
              console.log(`Filling text input: ${labelText}`);
              textInput.value = valueText;
              textInput.dispatchEvent(new Event("input", { bubbles: true }));
              textInput.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            }

            // Check for textarea
            const textarea = targetContainer.querySelector(
              "textarea:not([disabled])",
            ) as HTMLTextAreaElement | null;
            if (textarea) {
              console.log(`Filling textarea: ${labelText}`);
              textarea.value = valueText;
              textarea.dispatchEvent(new Event("input", { bubbles: true }));
              textarea.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            }

            console.log(`No input found for: ${labelText}`);
            return false;
          },
          label,
          value,
        );

        if (!fieldFilled) {
          console.warn(
            `[Schedule ${scheduleIndex}] ⚠️ Could not fill field: ${label}`,
          );
        } else {
          console.log(`[Schedule ${scheduleIndex}] ✅ Filled: ${label}`);
        }
      } catch (error) {
        console.error(
          `[Schedule ${scheduleIndex}] Error filling field ${label}:`,
          error,
        );
      }
    }

    // Wait a moment to ensure all fields are filled
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find and click the submit button
    console.log(`[Schedule ${scheduleIndex}] Looking for submit button...`);

    const submitClicked = await page.evaluate(() => {
      // Find by text content
      const allButtons = document.querySelectorAll(
        '[role="button"]:not([disabled]), button:not([disabled]), .uArJ5e:not([disabled])',
      );
      for (const btn of allButtons) {
        const text = btn.textContent?.toLowerCase() || "";
        if (text.includes("submit") || text.includes("send")) {
          console.log(`Found submit button: "${btn.textContent}"`);
          (btn as HTMLElement).click();
          return true;
        }
      }

      // Try to find by class
      const submitBtn = document.querySelector(
        '.QvWxOd:not([disabled]), .lRwqcd [role="button"]:not([disabled])',
      );
      if (submitBtn) {
        console.log("Found submit button by class");
        (submitBtn as HTMLElement).click();
        return true;
      }

      return false;
    });

    if (!submitClicked) {
      console.warn(
        `[Schedule ${scheduleIndex}] ⚠️ Could not find submit button`,
      );
      const timeTaken = Date.now() - startTime;
      return {
        success: false,
        message: "Could not find submit button",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }

    console.log(`[Schedule ${scheduleIndex}] ✅ Submit button clicked!`);

    // Wait for submission to complete - check for various success indicators
    console.log(
      `[Schedule ${scheduleIndex}] Waiting for submission response...`,
    );

    // Wait for either success or error
    const result = await page.waitForFunction(
      () => {
        // Check for thank you message
        const thankYou = document.querySelector(
          ".freebirdFormviewerViewResponseConfirmationMessage",
        );
        if (thankYou) {
          return {
            success: true,
            message: thankYou.textContent || "Form submitted successfully",
          };
        }

        // Check for "Your response has been recorded"
        const responseRecorded = document.body.textContent?.includes(
          "Your response has been recorded",
        );
        if (responseRecorded) {
          return {
            success: true,
            message: "Your response has been recorded",
          };
        }

        // Check for view-only mode (indicates successful submission)
        const inputs = document.querySelectorAll(
          'input:not([type="hidden"]), textarea',
        );
        let allDisabled = true;
        for (const input of inputs) {
          if (
            !input.hasAttribute("disabled") &&
            !input.hasAttribute("aria-disabled")
          ) {
            allDisabled = false;
            break;
          }
        }
        if (allDisabled && inputs.length > 0) {
          return {
            success: true,
            message: "Form submitted successfully (view mode detected)",
          };
        }

        // Check for error messages
        const errorMessages = document.querySelectorAll(
          ".errorbox, .freebirdFormviewerViewNumberedItemContainer",
        );
        for (const error of errorMessages) {
          if (
            error.textContent?.includes("required") ||
            error.textContent?.includes("invalid")
          ) {
            return {
              success: false,
              message: "Form validation failed: " + error.textContent,
            };
          }
        }

        return null;
      },
      { timeout: 15000, polling: 500 },
    );

    const timeTaken = Date.now() - startTime;

    // Check the result
    if (result && typeof result === "object" && "success" in result) {
      return {
        success: result.success,
        message:
          result.message ||
          (result.success
            ? "Form submitted successfully"
            : "Form submission failed"),
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    } else {
      // Check if we got redirected or if form is now in view-only mode
      const currentUrl = page.url();
      if (
        currentUrl.includes("viewform?vc=0") ||
        currentUrl.includes("formResponse") ||
        currentUrl.includes("viewform?usp=embed")
      ) {
        return {
          success: true,
          message: "Form submitted successfully",
          timeTaken,
          timeTakenFormatted: formatTime(timeTaken),
          scheduleIndex,
        };
      }

      // Check if form is now in view-only mode
      const finalStatus = await checkFormStatus(page);
      if (finalStatus.isSubmitted) {
        return {
          success: true,
          message: "Form submitted successfully",
          timeTaken,
          timeTakenFormatted: formatTime(timeTaken),
          scheduleIndex,
        };
      }

      return {
        success: false,
        message: "Form submission failed - unexpected response",
        timeTaken,
        timeTakenFormatted: formatTime(timeTaken),
        scheduleIndex,
      };
    }
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

async function submitMultipleSchedulesParallel(
  formUrl: string,
  schedules: Record<string, string>[],
): Promise<{
  success: boolean;
  message?: string;
  results?: ScheduleResult[];
  totalTime: number;
  totalTimeFormatted: string;
  averageTime: number;
  averageTimeFormatted: string;
}> {
  let browser: any = null;
  const results: ScheduleResult[] = [];

  const overallStartTime = Date.now();

  try {
    // Launch browser with more resources for parallel processing
    browser = await puppeteer.launch({
      headless: true, // Changed to true for headless mode
      defaultViewport: null,
      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });

    console.log(`Processing ${schedules.length} schedule(s) in parallel...`);

    // Create pages for each schedule
    const pages = await Promise.all(schedules.map(() => browser.newPage()));

    // Set up all pages with user agent
    await Promise.all(
      pages.map((page) =>
        page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
      ),
    );

    // Process all schedules in parallel
    const promises = schedules.map((schedule, index) => {
      return submitSingleScheduleInTab(
        pages[index],
        formUrl,
        schedule,
        index + 1,
      );
    });

    // Wait for all schedules to complete
    const resultsArray = await Promise.all(promises);
    results.push(...resultsArray);

    const totalTime = Date.now() - overallStartTime;
    const totalTimeFormatted = formatTime(totalTime);
    const averageTime = totalTime / schedules.length;
    const averageTimeFormatted = formatTime(averageTime);

    const successCount = results.filter((r) => r.success).length;
    const allSuccess = results.every((r) => r.success);

    // Close all pages
    await Promise.all(pages.map((page) => page.close()));

    return {
      success: allSuccess,
      message: `Submitted ${successCount}/${schedules.length} schedules successfully in parallel`,
      results: results.sort((a, b) => a.scheduleIndex - b.scheduleIndex),
      totalTime: totalTime,
      totalTimeFormatted: totalTimeFormatted,
      averageTime: averageTime,
      averageTimeFormatted: averageTimeFormatted,
    };
  } catch (error: any) {
    console.error("Error processing schedules:", error);
    const totalTime = Date.now() - overallStartTime;
    return {
      success: false,
      message: `Error processing schedules: ${error.message}`,
      results: results,
      totalTime: totalTime,
      totalTimeFormatted: formatTime(totalTime),
      averageTime: 0,
      averageTimeFormatted: "0s",
    };
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed");
    }
  }
}

async function submitFormWithPuppeteer(
  formUrl: string,
  fields: Record<string, string>,
): Promise<{
  success: boolean;
  message?: string;
  timeTaken: number;
  timeTakenFormatted: string;
}> {
  let browser: any = null;
  const startTime = Date.now();

  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true, // Changed to true for headless mode
      defaultViewport: null,
      args: [
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    const page = await browser.newPage();

    const result = await submitSingleScheduleInTab(page, formUrl, fields, 1);

    await page.close();

    return {
      success: result.success,
      message: result.message,
      timeTaken: result.timeTaken,
      timeTakenFormatted: result.timeTakenFormatted,
    };
  } catch (error: any) {
    console.error("Puppeteer error:", error);
    const timeTaken = Date.now() - startTime;
    return {
      success: false,
      message: `Error: ${error.message}`,
      timeTaken: timeTaken,
      timeTakenFormatted: formatTime(timeTaken),
    };
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed");
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { formUrl, schedules, fields, action, mode } = body;

    if (!formUrl) {
      return NextResponse.json(
        { error: "Missing formUrl in request body" },
        { status: 400 },
      );
    }

    const entryMap = await getEntryIdMap(formUrl);
    const actionType = action || "prefill";

    // Handle multiple schedules - process in parallel
    if (schedules && Array.isArray(schedules) && schedules.length > 0) {
      if (actionType === "submit") {
        const result = await submitMultipleSchedulesParallel(
          formUrl,
          schedules,
        );

        return NextResponse.json(
          {
            message: result.message || "Schedules processed",
            success: result.success,
            results: result.results || [],
            totalTime: result.totalTimeFormatted,
            averageTime: result.averageTimeFormatted,
          },
          { status: result.success ? 200 : 500 },
        );
      } else {
        // Prefill mode for multiple schedules - return prefilled URLs for each
        const prefilledUrls = schedules.map((scheduleFields) => {
          return buildPrefilledUrl(formUrl, entryMap, scheduleFields);
        });

        return NextResponse.json(
          {
            message: "Pre-filled URLs created successfully",
            prefilledUrls,
            mapping: entryMap,
            schedules: schedules,
          },
          { status: 201 },
        );
      }
    }

    // Handle single schedule (backward compatibility)
    if (!fields || typeof fields !== "object") {
      return NextResponse.json(
        { error: "Missing fields in request body" },
        { status: 400 },
      );
    }

    if (actionType === "submit") {
      const result = await submitFormWithPuppeteer(formUrl, fields);

      return NextResponse.json(
        {
          message: result.message || "Form submitted successfully",
          success: result.success,
          timeTaken: result.timeTakenFormatted,
        },
        { status: result.success ? 200 : 500 },
      );
    } else {
      const prefilledUrl = buildPrefilledUrl(formUrl, entryMap, fields);

      return NextResponse.json(
        {
          message: "Pre-filled URL created successfully",
          prefilledUrl,
          mapping: entryMap,
          fields: fields,
        },
        { status: 201 },
      );
    }
  } catch (error: any) {
    console.error("Error in autofill route:", error);
    return NextResponse.json(
      { error: "Failed to process the form", details: error.message },
      { status: 500 },
    );
  }
}
