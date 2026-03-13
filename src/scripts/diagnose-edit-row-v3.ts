/**
 * Diagnostic v3: Click a DATA row (not header) to enter edit mode.
 * The user confirmed clicking the row makes it editable.
 * Then fill metadata fields and click checkmark to save.
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

    // Navigate to GPT project
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'GPT' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await screenshot(page, 'diag-edit3-01-initial');

    // Verify we're on I&O
    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ hasAddNew }, 'On variable definition view?');

    // === Step 1: Get all row names to verify we have data rows ===
    const rowNames = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table');
      return Array.from(rows).map((row, idx) => {
        const nameCol = row.querySelector('.variable-name');
        return {
          idx,
          name: (nameCol as HTMLElement)?.textContent?.trim()?.slice(0, 40) || '',
          classes: (row as HTMLElement).className?.slice(0, 80) || '',
          isHeader: (row as HTMLElement).textContent?.includes('Type Of Variable') ?? false,
          id: (row as HTMLElement).id || '',
        };
      });
    });
    logger.info({ rowCount: rowNames.length, rows: rowNames.slice(0, 5) }, 'All rows');

    // Find first non-header data row
    const firstDataIdx = rowNames.findIndex(r => !r.isHeader && r.name && r.name !== 'Variable Name');
    logger.info({ firstDataIdx, name: rowNames[firstDataIdx]?.name }, 'First data row');

    if (firstDataIdx < 0) {
      logger.error('No data rows found');
      return;
    }

    // === Step 2: Click the first data row ===
    logger.info('=== Step 2: Clicking first DATA row ===');
    const dataRow = page.locator('.row-table').nth(firstDataIdx);
    await dataRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Try clicking the variable-name column specifically
    const nameCol = dataRow.locator('.variable-name');
    await nameCol.click();
    await page.waitForTimeout(2000);

    await screenshot(page, 'diag-edit3-02-after-click');

    // === Step 3: Check what changed ===
    const afterClick = await page.evaluate((idx: number) => {
      const rows = document.querySelectorAll('.row-table');
      const row = rows[idx];
      if (!row) return { error: 'Row not found' };

      const classes = (row as HTMLElement).className;
      const isAdding = row.classList.contains('addingRow');

      // Check all inputs
      const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"])')).map(inp => ({
        placeholder: (inp as HTMLInputElement).placeholder || '',
        value: (inp as HTMLInputElement).value?.slice(0, 50) || '',
        disabled: (inp as HTMLInputElement).disabled,
        type: (inp as HTMLInputElement).type,
        parentClasses: inp.parentElement?.className?.slice(0, 80) || '',
      }));

      // Check for confirm/checkmark button
      const confirmBtn = row.querySelector('.add-ingredient');
      const hasConfirm = !!confirmBtn;

      // Check all columns
      const children = Array.from(row.children);
      const cols = children.map((child, colIdx) => ({
        idx: colIdx,
        classes: (child as HTMLElement).className?.slice(0, 100) || '',
        text: (child as HTMLElement).textContent?.trim()?.slice(0, 50) || '',
        hasInputs: child.querySelectorAll('input:not([type="hidden"])').length > 0,
        hasSelects: child.querySelectorAll('.ant-select').length > 0,
      }));

      // Check for actions column
      const actionsCol = row.querySelector('.actions-column');

      return {
        classes: classes?.slice(0, 100),
        isAdding,
        inputCount: inputs.length,
        inputs,
        hasConfirm,
        colCount: cols.length,
        cols,
        hasActionsCol: !!actionsCol,
      };
    }, firstDataIdx);

    logger.info({
      isAdding: afterClick.isAdding,
      inputCount: afterClick.inputCount,
      hasConfirm: afterClick.hasConfirm,
      colCount: afterClick.colCount,
      hasActionsCol: afterClick.hasActionsCol,
      classes: afterClick.classes,
    }, 'After clicking data row');

    // Log columns
    for (const col of afterClick.cols || []) {
      if (col.hasInputs || col.hasSelects) {
        logger.info(col, `Col ${col.idx} (has fields)`);
      }
    }

    // Log all inputs
    for (const inp of afterClick.inputs || []) {
      logger.info(inp, `Input: ${inp.placeholder || inp.type}`);
    }

    // === Step 4: If edit mode activated, try filling metadata ===
    if (afterClick.isAdding || afterClick.inputCount > 4) {
      logger.info('=== EDIT MODE ACTIVATED! Filling metadata ===');

      const editRow = page.locator('.row-table').nth(firstDataIdx);

      // Try setting Type to "Existing ingredient"
      const typeSelect = editRow.locator('.select-input-type');
      if (await typeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isDisabled = await typeSelect.locator('.ant-select-selector').evaluate(
          (el) => el.closest('.ant-select')?.classList.contains('ant-select-disabled') ?? true
        ).catch(() => true);

        if (!isDisabled) {
          await typeSelect.locator('.ant-select-selector').click();
          await page.waitForTimeout(1200);

          const existOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Existing ingredient' }).first();
          if (await existOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
            await existOpt.click();
            await page.waitForTimeout(400);
            logger.info('Set type: Existing ingredient');
          } else {
            await page.keyboard.press('Escape');
            logger.warn('Could not find "Existing ingredient" option');
          }
        } else {
          logger.info('Type select is disabled in edit mode');
        }
      }

      // Try filling Cost
      const costInput = editRow.locator('input[placeholder="$/Kg"]');
      if (await costInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await costInput.fill('3.50');
        logger.info('Filled cost: 3.50');
      } else {
        logger.warn('Cost input not visible');
      }

      // Try filling Category
      const catInput = editRow.locator('.input-category input');
      if (await catInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await catInput.fill('Active Ingredient');
        logger.info('Filled category: Active Ingredient');
      } else {
        logger.warn('Category input not visible');
      }

      // Try filling Functional Role (test-condition column)
      // First check what inputs exist that could be the functional role
      const allInputs = editRow.locator('input.ant-input');
      const inputCount = await allInputs.count();
      logger.info({ inputCount }, 'ant-input count in row');

      for (let i = 0; i < inputCount; i++) {
        const inp = allInputs.nth(i);
        const placeholder = await inp.getAttribute('placeholder').catch(() => '');
        const value = await inp.inputValue().catch(() => '');
        const visible = await inp.isVisible().catch(() => false);
        logger.info({ idx: i, placeholder, value, visible }, `ant-input ${i}`);

        if (visible && (placeholder?.includes('emulsifier') || placeholder?.includes('Powdered') || placeholder === '')) {
          await inp.fill('Charcoal detoxifying agent');
          logger.info(`Filled functional role at ant-input ${i}`);
          break;
        }
      }

      await page.waitForTimeout(500);
      await screenshot(page, 'diag-edit3-03-filled');

      // Try clicking checkmark/confirm
      const confirmBtn = editRow.locator('.add-ingredient');
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        logger.info('=== Clicking confirm/checkmark ===');
        await confirmBtn.click();
        await page.waitForTimeout(2000);

        const toast = await page.evaluate(() => {
          const nodes = document.querySelectorAll('.ant-notification-notice');
          return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
        });
        logger.info({ toast }, 'Confirm result');

        await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
        await page.waitForTimeout(300);
      } else {
        logger.warn('Confirm button not visible');
      }

      await screenshot(page, 'diag-edit3-04-after-confirm');
    } else {
      logger.warn('Edit mode NOT activated — rows still read-only');

      // Try clicking elsewhere on the row
      logger.info('=== Trying to click the cost column ===');
      const costCol = dataRow.locator('.cost').first();
      if (await costCol.isVisible({ timeout: 1000 }).catch(() => false)) {
        await costCol.click();
        await page.waitForTimeout(1500);

        const afterCostClick = await page.evaluate((idx: number) => {
          const rows = document.querySelectorAll('.row-table');
          const row = rows[idx];
          if (!row) return {};
          return {
            isAdding: row.classList.contains('addingRow'),
            classes: (row as HTMLElement).className?.slice(0, 100),
            inputCount: row.querySelectorAll('input:not([type="hidden"])').length,
          };
        }, firstDataIdx);
        logger.info(afterCostClick, 'After clicking cost column');
      }

      // Try clicking the type column
      logger.info('=== Trying to click the type (name) column ===');
      const typeCol = dataRow.locator('.name').first();
      if (await typeCol.isVisible({ timeout: 1000 }).catch(() => false)) {
        await typeCol.click();
        await page.waitForTimeout(1500);

        const afterTypeClick = await page.evaluate((idx: number) => {
          const rows = document.querySelectorAll('.row-table');
          const row = rows[idx];
          if (!row) return {};
          return {
            isAdding: row.classList.contains('addingRow'),
            classes: (row as HTMLElement).className?.slice(0, 100),
            inputCount: row.querySelectorAll('input:not([type="hidden"])').length,
          };
        }, firstDataIdx);
        logger.info(afterTypeClick, 'After clicking type column');
      }

      await screenshot(page, 'diag-edit3-05-click-attempts');
    }

    logger.info('=== DIAGNOSTIC V3 COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
