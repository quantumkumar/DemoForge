/**
 * Explore the Projects page on the new tenant to find the correct create button.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';

async function dismissFloatingButton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
    if (floater) floater.style.display = 'none';
  });
}

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  const session = await launchBrowser({ headed: true, slowMo: 100 });
  const { page } = session;

  try {
    await login(page, { url, email, password });
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);

    // Click Projects card
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await screenshot(page, 'projects-page');
    logger.info({ url: page.url() }, 'Projects page');

    // Find all buttons
    const buttons = await page.locator('button').allTextContents();
    logger.info({ buttons: buttons.filter(b => b.trim()) }, 'All buttons on page');

    // Find all links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent?.trim(),
        href: a.getAttribute('href'),
      })).filter(l => l.text);
    });
    logger.info({ links }, 'All links on page');

    // Check for "Create" or "New" or "Add" type buttons
    const createBtns = await page.locator('button').filter({ hasText: /create|new|add/i }).allTextContents();
    logger.info({ createBtns }, 'Create-type buttons');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
