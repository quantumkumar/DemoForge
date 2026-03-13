/**
 * Diagnostic: Find the correct selector for the checkmark/confirm button
 * in the actions column when a committed row is in edit mode.
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

    // Enter edit mode on first data row (index 1, after header)
    const row = page.locator('.row-table').nth(1);
    const costCol = row.locator('.cost').first();
    await costCol.click();
    await page.waitForTimeout(2000);

    // Verify we're in edit mode
    const isEditing = await page.evaluate(() => {
      const r = document.querySelectorAll('.row-table')[1];
      return r?.classList.contains('addingRow') ?? false;
    });
    logger.info({ isEditing }, 'Edit mode');

    // Dump the FULL HTML of the actions column
    const actionsHTML = await page.evaluate(() => {
      const r = document.querySelectorAll('.row-table')[1];
      if (!r) return '';
      const actions = r.querySelector('.actions-column');
      return actions?.innerHTML || '(no .actions-column found)';
    });
    logger.info({ html: actionsHTML }, 'Actions column full HTML');

    // Check for add-ingredient specifically
    const addIngredientInfo = await page.evaluate(() => {
      const r = document.querySelectorAll('.row-table')[1];
      if (!r) return { error: 'No row' };
      const el = r.querySelector('.add-ingredient');
      if (!el) return { exists: false };
      const htmlEl = el as HTMLElement;
      return {
        exists: true,
        tag: htmlEl.tagName,
        classes: htmlEl.className?.toString()?.slice(0, 200) || '',
        display: getComputedStyle(htmlEl).display,
        visibility: getComputedStyle(htmlEl).visibility,
        opacity: getComputedStyle(htmlEl).opacity,
        width: htmlEl.offsetWidth,
        height: htmlEl.offsetHeight,
        hasParent: htmlEl.offsetParent !== null,
        innerHTML: htmlEl.innerHTML?.slice(0, 300) || '',
        parentClasses: htmlEl.parentElement?.className?.toString()?.slice(0, 100) || '',
      };
    });
    logger.info(addIngredientInfo, '.add-ingredient element');

    // Check ALL clickable elements in the row
    const clickables = await page.evaluate(() => {
      const r = document.querySelectorAll('.row-table')[1];
      if (!r) return [];
      // Look for SVG icons, buttons, anticons, anything clickable
      const selectors = [
        '.anticon', 'svg', 'button', '[role="button"]', '.anticon-check',
        '.anticon-close', '.anticon-check-circle', '.anticon-close-circle',
        '.add-ingredient', '[class*="confirm"]', '[class*="check"]',
        '[class*="save"]', '[class*="accept"]',
      ];
      const results: Array<{ selector: string; count: number; details: string }> = [];
      for (const sel of selectors) {
        const els = r.querySelectorAll(sel);
        if (els.length > 0) {
          results.push({
            selector: sel,
            count: els.length,
            details: Array.from(els).map(e => {
              const el = e as HTMLElement;
              return `tag=${el.tagName} class="${el.className?.toString()?.slice(0, 80)}" visible=${el.offsetParent !== null} display=${getComputedStyle(el).display}`;
            }).join(' | '),
          });
        }
      }
      return results;
    });
    for (const c of clickables) {
      logger.info(c, `Clickable: ${c.selector}`);
    }

    // Check the last 3 columns for any elements
    const lastCols = await page.evaluate(() => {
      const r = document.querySelectorAll('.row-table')[1];
      if (!r) return [];
      const children = Array.from(r.children);
      return children.slice(-3).map((col, idx) => ({
        colIdx: children.length - 3 + idx,
        classes: (col as HTMLElement).className?.slice(0, 100) || '',
        html: col.innerHTML?.slice(0, 500) || '',
        childCount: col.children.length,
      }));
    });
    for (const col of lastCols) {
      logger.info(col, `Last col ${col.colIdx}`);
    }

    // Also: scroll right to make sure the confirm column is visible
    await page.evaluate(() => {
      const row = document.querySelectorAll('.row-table')[1];
      if (!row) return;
      let parent = row.parentElement;
      while (parent) {
        if (parent.scrollWidth > parent.clientWidth) {
          parent.scrollLeft = parent.scrollWidth;
          break;
        }
        parent = parent.parentElement;
      }
    });
    await page.waitForTimeout(500);
    await screenshot(page, 'diag-confirm-01-scrolled');

    // Re-check .add-ingredient after scrolling
    const afterScroll = await row.locator('.add-ingredient').isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ afterScroll }, '.add-ingredient visible after scroll');

    // Try clicking it anyway (force)
    const addIngEl = row.locator('.add-ingredient');
    const addIngCount = await addIngEl.count();
    logger.info({ count: addIngCount }, '.add-ingredient element count');

    if (addIngCount > 0) {
      try {
        await addIngEl.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const isVisNow = await addIngEl.first().isVisible().catch(() => false);
        logger.info({ isVisNow }, 'After scrollIntoViewIfNeeded');

        if (isVisNow) {
          await addIngEl.first().click();
          await page.waitForTimeout(2000);

          const toast = await page.evaluate(() => {
            const nodes = document.querySelectorAll('.ant-notification-notice');
            return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
          });
          logger.info({ toast: toast || '(none)' }, 'After clicking .add-ingredient');
        }
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error clicking .add-ingredient');
      }
    }

    await screenshot(page, 'diag-confirm-02-final');
    logger.info('=== DIAGNOSTIC COMPLETE ===');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
