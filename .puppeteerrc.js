const { join } = require("path");

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Use a writable cache directory on Render
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
  chrome: {
    skipDownload: false,
  },
};
