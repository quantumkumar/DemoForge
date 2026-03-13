/**
 * Diagnostic v2: Try to get template via network interception,
 * and try clicking sidebar steps directly.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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

  const session = await launchBrowser({ headed: true, slowMo: 80 });
  const { page } = session;

  try {
    await login(page, { url, email, password });
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);

    // Go to SDS project
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'SDS' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // ===== TEST 1: Intercept template download =====
    logger.info('=== TEST 1: Intercept template download ===');

    // Set up route interception for CSV downloads
    let templateContent = '';
    page.on('response', async (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('csv') || responseUrl.includes('template') || responseUrl.includes('csv') || responseUrl.includes('download')) {
        try {
          const body = await response.text();
          templateContent = body;
          logger.info({ url: responseUrl, contentType, bodyLength: body.length, preview: body.slice(0, 500) }, 'Intercepted CSV response');
        } catch (e) {
          logger.warn({ url: responseUrl, error: String(e) }, 'Could not read response body');
        }
      }
    });

    // Try clicking the download template link with newPage detection
    const templateLink = page.locator('a, span, button').filter({ hasText: /download template/i }).first();

    // Check what element it actually is
    const linkInfo = await templateLink.evaluate(el => ({
      tag: el.tagName,
      href: (el as HTMLAnchorElement).href || '',
      target: (el as HTMLAnchorElement).target || '',
      onclick: el.getAttribute('onclick') || '',
      classes: el.className?.slice(0, 100) || '',
      outerHTML: el.outerHTML?.slice(0, 300) || '',
    }));
    logger.info(linkInfo, 'Template link element');

    // If it's a regular link with href, fetch the URL directly
    if (linkInfo.href && linkInfo.href !== '' && !linkInfo.href.startsWith('javascript:')) {
      logger.info({ href: linkInfo.href }, 'Template link has href — fetching directly');
      const response = await page.request.get(linkInfo.href);
      const body = await response.text();
      logger.info({
        status: response.status(),
        bodyLength: body.length,
        preview: body.slice(0, 1000),
      }, 'Direct fetch result');
      templateContent = body;
    } else {
      // Click and wait for potential new tab or download
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
        templateLink.click(),
      ]);

      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded');
        const newUrl = newPage.url();
        const content = await newPage.content();
        logger.info({ newUrl, contentLength: content.length, preview: content.slice(0, 500) }, 'New tab opened');
        await newPage.close();
      }

      await page.waitForTimeout(3000);
    }

    if (templateContent) {
      const tmpDir = join(process.cwd(), '.tmp');
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'template_SDS.csv'), templateContent, 'utf-8');
      logger.info('Template saved to .tmp/template_SDS.csv');
    } else {
      logger.warn('No template content captured');
    }

    // ===== TEST 2: Try clicking sidebar "Inputs & Outcomes" directly =====
    logger.info('=== TEST 2: Try clicking sidebar steps ===');

    // Inspect the sidebar step items
    const sidebarInfo = await page.evaluate(() => {
      // Look for step items in the left sidebar
      const steps = document.querySelectorAll('.ant-steps-item, [class*="step"], [class*="sidebar"]');
      return Array.from(steps).map(s => ({
        text: (s as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
        classes: s.className?.slice(0, 150) || '',
        tag: s.tagName,
        clickable: !s.classList.contains('ant-steps-item-disabled'),
      }));
    });
    logger.info({ steps: sidebarInfo }, 'Sidebar steps');

    // Try clicking "Inputs & Outcomes" in the sidebar
    const ioStep = page.locator('text=Inputs & Outcomes').first();
    const ioVisible = await ioStep.isVisible({ timeout: 2000 }).catch(() => false);
    logger.info({ ioVisible }, 'I&O step link visible');

    if (ioVisible) {
      await ioStep.click();
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);
      await screenshot(page, 'diag-upload-v2-after-io-click');

      // Check if we're now on I&O with "+ Add new" button
      const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
      logger.info({ hasAddNew }, 'After clicking I&O sidebar');

      if (hasAddNew) {
        logger.info('SUCCESS: Directly navigated to I&O via sidebar!');
      }
    }

    // ===== TEST 3: Check if Save button advances, or if we can use the back arrow =====
    logger.info('=== TEST 3: Check other navigation options ===');

    // Go back to SDS
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'SDS' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Check what step we land on
    const currentStep = await page.evaluate(() => {
      const activeStep = document.querySelector('.ant-steps-item-active, .ant-steps-item-process');
      return activeStep?.textContent?.trim()?.slice(0, 50) || '(none)';
    });
    logger.info({ currentStep }, 'Landing step');

    // Look for ANY clickable thing that could advance us
    const allButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim()?.slice(0, 50) || '',
        disabled: b.disabled,
        classes: b.className?.slice(0, 80) || '',
        visible: (b as HTMLElement).offsetParent !== null,
      }));
    });
    logger.info({ allButtons }, 'All buttons on page');

    await screenshot(page, 'diag-upload-v2-final');
    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
