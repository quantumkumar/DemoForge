/**
 * Diagnostic: Check why Next button is disabled on WBfF I&O page.
 * Check for validation errors, required fields, tooltip on Next.
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

    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'WBfF' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Check Next button state
    const nextBtn = page.getByRole('button', { name: /next/i });
    const nextVisible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const nextDisabled = nextVisible ? await nextBtn.isDisabled().catch(() => true) : true;
    logger.info({ nextVisible, nextDisabled }, 'Next button');

    // Hover over Next to check tooltip
    if (nextVisible) {
      await nextBtn.hover();
      await page.waitForTimeout(1000);
      const tooltip = await page.locator('.ant-tooltip-inner').textContent().catch(() => '');
      logger.info({ tooltip }, 'Next button tooltip');
    }

    // Check the Save button too
    const saveBtn = page.getByRole('button', { name: /save/i });
    const saveVisible = await saveBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const saveDisabled = saveVisible ? await saveBtn.isDisabled().catch(() => true) : true;
    logger.info({ saveVisible, saveDisabled }, 'Save button');

    // Check for any validation errors on the page
    const validationErrors = await page.evaluate(() => {
      const errors = document.querySelectorAll('.ant-form-item-explain-error, [class*="error"], [class*="invalid"], .ant-form-item-has-error');
      return Array.from(errors)
        .filter(e => (e as HTMLElement).offsetParent !== null)
        .map(e => ({
          text: (e as HTMLElement).textContent?.trim()?.slice(0, 200) || '',
          classes: (e as HTMLElement).className?.slice(0, 100) || '',
        }));
    });
    logger.info({ errors: validationErrors }, 'Validation errors');

    // Check the status of the red dot on "Inputs & Outcomes" step
    const stepStatus = await page.evaluate(() => {
      const steps = document.querySelectorAll('.ant-steps-item, [class*="step"]');
      return Array.from(steps)
        .filter(s => (s as HTMLElement).offsetParent !== null)
        .map(s => ({
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
          classes: (s as HTMLElement).className?.slice(0, 100) || '',
        }));
    });
    logger.info({ steps: stepStatus }, 'Step statuses');

    // Check ALL rows for missing required fields
    const rowStatuses = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not([id="header"])');
      return Array.from(rows).map((row, idx) => {
        const name = (row.querySelector('.variable-name') as HTMLElement)?.textContent?.trim() || '';
        if (name === 'Variable Name') return null;

        const type = (row.querySelector('.name') as HTMLElement)?.textContent?.trim() || '';
        const category = (row.querySelector('.input-category') as HTMLElement)?.textContent?.trim() || '';
        const funcRole = (row.querySelector('.test-condition') as HTMLElement)?.textContent?.trim() || '';
        const costEl = row.querySelectorAll('.cost');
        const cost = costEl.length > 0 ? (costEl[0] as HTMLElement)?.textContent?.trim() || '' : '';

        // Check for red borders or error indicators
        const hasError = row.querySelector('[class*="error"], [class*="invalid"], .ant-input-status-error') !== null;

        return {
          idx,
          name: name.slice(0, 30),
          type: type.slice(0, 20),
          category: category.slice(0, 20),
          funcRole: funcRole.slice(0, 40),
          cost,
          hasError,
        };
      }).filter(Boolean);
    });
    logger.info({ rowCount: rowStatuses.length }, 'Row statuses');
    for (const row of rowStatuses) {
      if (row) {
        const isEmpty = !row.category && !row.funcRole;
        if (isEmpty) logger.warn(row, `Row ${row.idx}: MISSING metadata`);
        else logger.info(row, `Row ${row.idx}: OK`);
      }
    }

    // Check if there's a filler ingredient requirement message
    const fillerMsg = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      const matches: string[] = [];
      for (const el of els) {
        const text = (el as HTMLElement).textContent?.toLowerCase() || '';
        if (text.includes('filler') && (el as HTMLElement).offsetParent !== null && (el as HTMLElement).children.length < 3) {
          matches.push((el as HTMLElement).textContent?.trim()?.slice(0, 200) || '');
        }
      }
      return matches.slice(0, 5);
    });
    logger.info({ fillerMsg }, 'Filler-related messages');

    // Try clicking Save first, then check Next
    if (saveVisible && !saveDisabled) {
      logger.info('Clicking Save button');
      await saveBtn.click();
      await page.waitForTimeout(3000);

      const toast = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.ant-notification-notice');
        return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
      });
      logger.info({ toast: toast || '(none)' }, 'After Save');
      await page.locator('.ant-notification-notice-close').first().click().catch(() => {});

      // Check Next again
      const nextAfterSave = await nextBtn.isDisabled().catch(() => true);
      logger.info({ nextAfterSave }, 'Next disabled after Save?');
    }

    await screenshot(page, 'diag-next-01');
    logger.info('=== DIAGNOSTIC COMPLETE ===');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
