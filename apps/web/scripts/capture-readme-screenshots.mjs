// Captures the README screenshots from a running local instance.
import { chromium } from "playwright";
import { BASE, login } from "./e2e-helpers.mjs";

const OUT = new URL("../../../docs/images/", import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

async function shot(name, full = false) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
  console.log("saved", name, page.url());
}

await page.goto(BASE);
await shot("landing");
await page.goto(`${BASE}/login`);
await shot("login");
await page.goto(`${BASE}/verify`);
await shot("verify");
await login(page);
await page.waitForTimeout(25000); // the dashboard fans out one request per document version
await page.waitForFunction(() => !document.body.innerText.includes("Loading..."), null, { timeout: 120000 }).catch(() => {});
await shot("dashboard");
const link = page.locator('a[href^="/dashboard/cases/"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForTimeout(10000);
  await page.waitForFunction(() => !document.body.innerText.includes("Loading..."), null, { timeout: 120000 }).catch(() => {});
  await shot("case");
}
await browser.close();
