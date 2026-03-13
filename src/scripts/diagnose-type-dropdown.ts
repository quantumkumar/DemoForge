/**
 * Diagnostic: Test the type dropdown in committed-row edit mode.
 * 1. Enter edit mode
 * 2. Click the type dropdown
 * 3. Screenshot options
 * 4. Try to select a different type
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

    // Enter edit mode on Hydrated Silica (row idx 5, should be Processing)
    // First find a row that's "Processing" type
    const rows = await page.evaluate(() => {
      const allRows = document.querySelectorAll('.row-table');
      return Array.from(allRows).map((r, idx) => ({
        idx,
        name: (r.querySelector('.variable-name') as HTMLElement)?.textContent?.trim()?.slice(0, 30) || '',
        type: (r.querySelector('.name') as HTMLElement)?.textContent?.trim() || '',
        isHeader: (r.querySelector('.variable-name') as HTMLElement)?.textContent?.trim() === 'Variable Name',
      }));
    });

    const targetRow = rows.find(r => !r.isHeader && r.type === 'Processing' && r.name && !r.name.includes('Mixing'));
    logger.info({ target: targetRow }, 'Target row');
    if (!targetRow) {
      logger.error('No suitable Processing row found');
      return;
    }

    // Click cost column to enter edit mode
    const row = page.locator('.row-table').nth(targetRow.idx);
    const costCol = row.locator('.cost').first();
    await costCol.click();
    await page.waitForTimeout(2000);

    const isEditing = await page.evaluate((idx: number) => {
      return document.querySelectorAll('.row-table')[idx]?.classList.contains('addingRow') ?? false;
    }, targetRow.idx);
    logger.info({ isEditing }, 'Edit mode');

    // Check the type select details
    const typeSelectInfo = await page.evaluate((idx: number) => {
      const r = document.querySelectorAll('.row-table')[idx];
      if (!r) return { error: 'no row' };
      const nameCol = r.querySelector('.name');
      if (!nameCol) return { error: 'no .name column' };

      const select = nameCol.querySelector('.ant-select');
      if (!select) return { error: 'no .ant-select in .name' };

      return {
        text: (select as HTMLElement).textContent?.trim(),
        disabled: select.classList.contains('ant-select-disabled'),
        open: select.classList.contains('ant-select-open'),
        classes: select.className?.toString()?.slice(0, 200),
        selectorText: (select.querySelector('.ant-select-selection-item') as HTMLElement)?.textContent?.trim() || '',
      };
    }, targetRow.idx);
    logger.info(typeSelectInfo, 'Type select details');

    // Try clicking the type select
    const typeSelectEl = row.locator('.name .ant-select .ant-select-selector');
    const isTypeVisible = await typeSelectEl.isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ isTypeVisible }, 'Type select selector visible');

    if (isTypeVisible) {
      await typeSelectEl.click();
      await page.waitForTimeout(1500);

      await screenshot(page, 'diag-type-01-dropdown-open');

      // Check for dropdown
      const dropdownVisible = await page.locator('.ant-select-dropdown').isVisible({ timeout: 2000 }).catch(() => false);
      logger.info({ dropdownVisible }, 'Dropdown appeared');

      if (dropdownVisible) {
        // Get all options
        const options = await page.evaluate(() => {
          const items = document.querySelectorAll('.ant-select-item-option');
          return Array.from(items)
            .filter(i => (i as HTMLElement).offsetParent !== null)
            .map(i => ({
              text: (i as HTMLElement).textContent?.trim()?.slice(0, 100) || '',
              classes: (i as HTMLElement).className?.slice(0, 100) || '',
              selected: i.classList.contains('ant-select-item-option-selected'),
            }));
        });
        logger.info({ optionCount: options.length, options }, 'Dropdown options');

        // Try clicking "Existing ingredient" or "Filler ingredient"
        const existOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Existing ingredient' }).first();
        const fillerOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Filler ingredient' }).first();

        const existVisible = await existOpt.isVisible({ timeout: 500 }).catch(() => false);
        const fillerVisible = await fillerOpt.isVisible({ timeout: 500 }).catch(() => false);
        logger.info({ existVisible, fillerVisible }, 'Target options visible');

        if (existVisible) {
          await existOpt.click();
          await page.waitForTimeout(1000);
          logger.info('Clicked Existing ingredient option');
        } else if (fillerVisible) {
          await fillerOpt.click();
          await page.waitForTimeout(1000);
          logger.info('Clicked Filler ingredient option');
        } else {
          // Try clicking any non-selected option
          const firstNonSelected = await page.evaluate(() => {
            const items = document.querySelectorAll('.ant-select-item-option');
            for (const item of items) {
              if ((item as HTMLElement).offsetParent !== null && !item.classList.contains('ant-select-item-option-selected')) {
                return (item as HTMLElement).textContent?.trim() || '';
              }
            }
            return '';
          });
          logger.info({ firstNonSelected }, 'First non-selected option');
        }
      } else {
        // Check what happened instead of dropdown
        const pageState = await page.evaluate(() => {
          // Any popovers, modals, or overlays?
          const popover = document.querySelector('.ant-popover');
          const modal = document.querySelector('.ant-modal');
          return {
            hasPopover: !!popover && (popover as HTMLElement).offsetParent !== null,
            hasModal: !!modal && (modal as HTMLElement).offsetParent !== null,
          };
        });
        logger.info(pageState, 'Page state after click');
      }

      await page.keyboard.press('Escape');
    }

    // Also check: can we click the .name column's ant-select-selector directly?
    logger.info('=== Trying direct .ant-select-selector click ===');
    const directSelector = row.locator('.name .ant-select-selector');
    const directVisible = await directSelector.isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ directVisible }, 'Direct selector visible');

    if (directVisible) {
      await directSelector.click({ force: true });
      await page.waitForTimeout(1500);

      const ddVisible = await page.locator('.ant-select-dropdown').isVisible({ timeout: 1000 }).catch(() => false);
      logger.info({ ddVisible }, 'Dropdown after force click');

      if (ddVisible) {
        await screenshot(page, 'diag-type-02-force-dropdown');

        const opts = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.ant-select-item-option'))
            .filter(i => (i as HTMLElement).offsetParent !== null)
            .map(i => (i as HTMLElement).textContent?.trim()?.slice(0, 80) || '')
            .slice(0, 20);
        });
        logger.info({ options: opts }, 'Force-click dropdown options');
      }

      await page.keyboard.press('Escape');
    }

    await screenshot(page, 'diag-type-03-final');
    logger.info('=== DIAGNOSTIC COMPLETE ===');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
