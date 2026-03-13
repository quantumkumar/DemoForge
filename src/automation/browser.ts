import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchBrowser(options?: {
  headed?: boolean;
  slowMo?: number;
}): Promise<BrowserSession> {
  const headed = options?.headed ?? process.env.HEADED === 'true';
  const envSlowMo = parseInt(process.env.SLOW_MO || '0', 10);
  const slowMo = options?.slowMo ?? (envSlowMo || (headed ? 100 : 0));

  logger.info({ headed, slowMo }, 'Launching browser');

  const browser = await chromium.launch({
    headless: !headed,
    slowMo,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  return { browser, context, page };
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.browser.close();
  logger.info('Browser closed');
}

let screenshotCounter = 0;

export async function screenshot(page: Page, label: string): Promise<string> {
  const dir = process.env.SCREENSHOT_DIR || './screenshots';
  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = label.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().slice(0, 60);
  const filename = `${timestamp}-${String(++screenshotCounter).padStart(3, '0')}-${slug}.png`;
  const filepath = join(dir, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: false, timeout: 10_000 });
    logger.debug({ filepath }, `Screenshot: ${label}`);
  } catch {
    logger.debug({ label }, `Screenshot skipped (timeout): ${label}`);
  }
  return filepath;
}
