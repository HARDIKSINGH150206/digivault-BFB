// Drives the crypto-core POC harness in an actual browser (headless
// Chromium via Playwright) rather than a mocked-canvas unit test, per
// CLAUDE.md build order step 1. Prints the harness's JSON result and exits
// non-zero if any check failed or the harness errored.
import { createServer } from "vite";
import { chromium } from "playwright";

const PORT = 5183;

async function main() {
  const server = await createServer({
    configFile: new URL("./vite.config.ts", import.meta.url).pathname,
    server: { port: PORT, strictPort: true },
  });
  await server.listen();

  const browser = await chromium.launch({
    args: ["--enable-precise-memory-info"],
  });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser:error]", msg.text());
  });
  page.on("pageerror", (err) => console.error("[browser:pageerror]", err));

  let resultJson = null;
  try {
    const qs = process.argv.slice(2).join("&");
    await page.goto(`http://localhost:${PORT}/index.html${qs ? "?" + qs : ""}`, { waitUntil: "load" });
    await page.waitForSelector('body[data-status="ok"], body[data-status="error"]', {
      timeout: 120_000,
    });
    const text = await page.textContent("#result");
    resultJson = JSON.parse(text);
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(JSON.stringify(resultJson, null, 2));

  if (resultJson.status !== "ok" || resultJson.allTestsPassed !== true) {
    console.error("\nPOC FAILED");
    process.exit(1);
  }
  console.log("\nPOC PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
