/**
 * Quick test: Can we fill the Category/Functional Role field using .fill()
 * and have it register for "Existing ingredient" commit?
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

    // Go to Projects → WBfF
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'WBfF' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasAddNew) {
      logger.error('Not on I&O step');
      return;
    }

    // First, check if there are already committed rows and log them
    const existingRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const result: string[] = [];
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;
        const text = row.textContent?.trim()?.slice(0, 200) || '';
        if (text.includes('Variable Name') || text.includes('+ Add new')) continue;
        result.push(text.slice(0, 100));
      }
      return result;
    });
    logger.info({ existingRows, count: existingRows.length }, 'Existing rows');

    // ========== ATTEMPT: "Existing ingredient" + Category via .fill() ==========
    logger.info('=== Attempt: Existing ingredient + Category .fill() ===');

    // Click Add new
    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Set type to "Existing ingredient"
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const typeSelect = page.locator('.select-input-type').last();
    await typeSelect.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await typeSelect.locator('.ant-select-selector').click();
    await page.waitForTimeout(1200);

    const existOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Existing ingredient' }).first();
    if (await existOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await existOpt.click();
      await page.waitForTimeout(400);
      logger.info('Set type: Existing ingredient');
    }

    // Select ingredient from library
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.click();
    await page.waitForTimeout(300);
    await acInput.fill('');
    await acInput.pressSequentially('Hydrated Silica', { delay: 50 });
    await page.waitForTimeout(1500);

    const silicaOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Hydrated Silica' }).first();
    if (await silicaOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await silicaOpt.click();
      await page.waitForTimeout(800);
      logger.info('Selected Hydrated Silica');
    }

    // Set bounds
    await page.locator('input[placeholder="lower bound"]').last().fill('15');
    await page.locator('input[placeholder="upper bound"]').last().fill('25');
    await page.waitForTimeout(200);

    // Now fill Category using .fill() — target the input inside .input-category
    const categoryInput = page.locator('.input-category input').last();
    const catVisible = await categoryInput.isVisible({ timeout: 2000 }).catch(() => false);
    logger.info({ catVisible }, 'Category input visible?');

    if (catVisible) {
      // Use Playwright's fill() which properly triggers React events
      await categoryInput.fill('Abrasive');
      await page.waitForTimeout(300);

      // Verify value was set
      const catValue = await categoryInput.inputValue().catch(() => '');
      logger.info({ catValue }, 'Category value after .fill()');

      // Blur the input to trigger any onBlur handlers
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.waitForTimeout(300);
    } else {
      logger.warn('Category input NOT visible — trying placeholder selector');
      const catInput2 = page.locator('input[placeholder="Liquid"]').last();
      if (await catInput2.isVisible({ timeout: 1000 }).catch(() => false)) {
        await catInput2.fill('Abrasive');
        await page.waitForTimeout(300);
        const catValue2 = await catInput2.inputValue().catch(() => '');
        logger.info({ catValue2 }, 'Category value via placeholder selector');
        await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
        await page.waitForTimeout(300);
      }
    }

    // Set unit
    const unitInput = page.locator('input[placeholder="%/grm"]').last();
    if (await unitInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await unitInput.fill('%');
      await page.waitForTimeout(200);
    }

    await screenshot(page, 'diag6-before-commit');

    // Click "+ Add" to commit
    const addBtn = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      await page.waitForTimeout(2000);
    }

    const toast = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-notification-notice');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
    });
    logger.info({ toast }, 'Commit result');

    await screenshot(page, 'diag6-after-commit');

    // Dismiss notification
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(500);

    // If successful, try adding a second row (test multi-row capability)
    if (toast.includes('successfully')) {
      logger.info('=== SUCCESS! Trying second row ===');

      await page.getByRole('button', { name: /add new/i }).click();
      await page.waitForTimeout(1500);

      // Blur + Escape
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Set type to "Processing"
      const typeSelect2 = page.locator('.select-input-type').last();
      await typeSelect2.scrollIntoViewIfNeeded();
      await typeSelect2.locator('.ant-select-selector').click();
      await page.waitForTimeout(1200);

      const procOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Processing' }).first();
      if (await procOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await procOpt.click();
        await page.waitForTimeout(400);
        logger.info('Set type: Processing');
      }

      // Custom name: Mixing Speed
      const acInput2 = page.locator('.ant-select-auto-complete input').last();
      await acInput2.click();
      await page.waitForTimeout(300);
      await acInput2.fill('');
      await acInput2.pressSequentially('Mixing Speed', { delay: 50 });
      await page.waitForTimeout(800);
      await acInput2.press('Enter');
      await page.waitForTimeout(400);

      // Set bounds
      await page.locator('input[placeholder="lower bound"]').last().fill('500');
      await page.locator('input[placeholder="upper bound"]').last().fill('900');
      await page.waitForTimeout(200);

      // Set unit
      const unitInput2 = page.locator('input[placeholder="%/grm"]').last();
      if (await unitInput2.isVisible({ timeout: 1000 }).catch(() => false)) {
        await unitInput2.fill('RPM');
        await page.waitForTimeout(200);
      }

      // Commit
      const addBtn2 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
      if (await addBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn2.scrollIntoViewIfNeeded();
        await addBtn2.click();
        await page.waitForTimeout(2000);
      }

      const toast2 = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.ant-notification-notice');
        return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
      });
      logger.info({ toast2 }, 'Second row commit result');

      await screenshot(page, 'diag6-second-row');

      // Dismiss notification
      await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
      await page.waitForTimeout(500);

      // Try a third row — Analytical outcome
      if (toast2.includes('successfully')) {
        logger.info('=== Second row SUCCESS! Trying outcome ===');

        await page.getByRole('button', { name: /add new/i }).click();
        await page.waitForTimeout(1500);

        await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
        await page.waitForTimeout(200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Set type to "Analytical outcome"
        const typeSelect3 = page.locator('.select-input-type').last();
        await typeSelect3.scrollIntoViewIfNeeded();
        await typeSelect3.locator('.ant-select-selector').click();
        await page.waitForTimeout(1200);

        const analyOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Analytical outcome' }).first();
        if (await analyOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
          await analyOpt.click();
          await page.waitForTimeout(400);
          logger.info('Set type: Analytical outcome');
        }

        // Custom name: Whitening Shade Change
        const acInput3 = page.locator('.ant-select-auto-complete input').last();
        await acInput3.click();
        await page.waitForTimeout(300);
        await acInput3.fill('');
        await acInput3.pressSequentially('Whitening Shade Change', { delay: 50 });
        await page.waitForTimeout(800);
        await acInput3.press('Enter');
        await page.waitForTimeout(400);

        // Set bounds
        await page.locator('input[placeholder="lower bound"]').last().fill('0');
        await page.locator('input[placeholder="upper bound"]').last().fill('5');
        await page.waitForTimeout(200);

        // Set priority to High
        const allSelects = page.locator('.ant-select');
        const selCount = await allSelects.count();
        for (let i = selCount - 1; i >= 0; i--) {
          const sel = allSelects.nth(i);
          const text = await sel.textContent().catch(() => '');
          if (text?.includes('Low') || text?.includes('Medium') || text?.includes('High')) {
            const classes = await sel.getAttribute('class').catch(() => '') ?? '';
            if (classes.includes('select-input-type') || classes.includes('auto-complete')) continue;
            await sel.locator('.ant-select-selector').click();
            await page.waitForTimeout(500);
            const highOpt = page.locator('.ant-select-item-option').filter({ hasText: 'High' }).first();
            if (await highOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
              await highOpt.click();
              await page.waitForTimeout(300);
              logger.info('Set priority: High');
            } else {
              await page.keyboard.press('Escape');
            }
            break;
          }
        }

        // Commit
        const addBtn3 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
        if (await addBtn3.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addBtn3.scrollIntoViewIfNeeded();
          await addBtn3.click();
          await page.waitForTimeout(2000);
        }

        const toast3 = await page.evaluate(() => {
          const nodes = document.querySelectorAll('.ant-notification-notice');
          return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
        });
        logger.info({ toast3 }, 'Third row (outcome) commit result');

        await screenshot(page, 'diag6-third-row');
        await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
      }
    }

    logger.info('=== DIAGNOSTIC COMPLETE ===');
    await screenshot(page, 'diag6-final');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
