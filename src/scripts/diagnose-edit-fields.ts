/**
 * Diagnostic: Click a committed row to enter edit mode, then catalog ALL input fields
 * with their selectors, placeholders, values, and disabled states.
 * Specifically targeting the Category and Functional Role columns.
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

    // Navigate to WBfF project
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'WBfF' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await screenshot(page, 'diag-fields-01-initial');

    // Get all committed rows
    const rows = await page.evaluate(() => {
      const allRows = document.querySelectorAll('.row-table');
      return Array.from(allRows).map((row, idx) => {
        const nameEl = row.querySelector('.variable-name') as HTMLElement;
        const name = nameEl?.textContent?.trim() || '';
        const isHeader = name === 'Variable Name' || (row as HTMLElement).id === 'header';
        const isAdding = row.classList.contains('addingRow');
        return { idx, name: name.slice(0, 40), isHeader, isAdding };
      });
    });
    logger.info({ rows: rows.filter(r => !r.isHeader) }, 'All rows');

    // Find "Alumina" (or first non-header data row)
    const targetRow = rows.find(r => !r.isHeader && !r.isAdding && r.name);
    if (!targetRow) {
      logger.error('No suitable data row found');
      return;
    }
    logger.info({ target: targetRow }, 'Will edit this row');

    // Click .cost column to enter edit mode
    const rowEl = page.locator('.row-table').nth(targetRow.idx);
    const costCol = rowEl.locator('.cost').first();
    await costCol.scrollIntoViewIfNeeded();
    await costCol.click();
    await page.waitForTimeout(2000);

    // Verify edit mode
    const isEditing = await page.evaluate((idx: number) => {
      const r = document.querySelectorAll('.row-table')[idx];
      return r?.classList.contains('addingRow') ?? false;
    }, targetRow.idx);
    logger.info({ isEditing, name: targetRow.name }, 'Edit mode status');

    if (!isEditing) {
      logger.error('Edit mode not activated');
      return;
    }

    // Now catalog ALL fields in this specific row
    const fieldInfo = await page.evaluate((idx: number) => {
      const row = document.querySelectorAll('.row-table')[idx];
      if (!row) return { error: 'Row not found' };

      // Get all direct children (columns)
      const columns = Array.from(row.children).map((col, colIdx) => {
        const el = col as HTMLElement;
        const inputs = Array.from(el.querySelectorAll('input:not([type="hidden"])'));
        const selects = Array.from(el.querySelectorAll('.ant-select'));

        return {
          colIdx,
          classes: el.className?.slice(0, 120) || '',
          text: el.textContent?.trim()?.slice(0, 60) || '',
          width: el.offsetWidth,
          inputs: inputs.map(inp => ({
            placeholder: (inp as HTMLInputElement).placeholder || '',
            value: (inp as HTMLInputElement).value?.slice(0, 50) || '',
            disabled: (inp as HTMLInputElement).disabled,
            readOnly: (inp as HTMLInputElement).readOnly,
            type: (inp as HTMLInputElement).type,
            classes: inp.className?.slice(0, 100) || '',
            parentClasses: inp.parentElement?.className?.slice(0, 100) || '',
          })),
          selects: selects.map(sel => ({
            text: (sel as HTMLElement).textContent?.trim()?.slice(0, 40) || '',
            disabled: sel.classList.contains('ant-select-disabled'),
            classes: sel.className?.toString()?.slice(0, 100) || '',
          })),
        };
      });

      return { colCount: columns.length, columns };
    }, targetRow.idx);

    if ('error' in fieldInfo) {
      logger.error(fieldInfo.error);
      return;
    }

    logger.info({ colCount: fieldInfo.colCount }, 'Columns in editing row');
    for (const col of fieldInfo.columns) {
      const hasFields = col.inputs.length > 0 || col.selects.length > 0;
      logger.info({
        colIdx: col.colIdx,
        classes: col.classes.slice(0, 60),
        text: col.text.slice(0, 40),
        width: col.width,
        inputCount: col.inputs.length,
        selectCount: col.selects.length,
      }, `Col ${col.colIdx}${hasFields ? ' (HAS FIELDS)' : ''}`);

      for (const inp of col.inputs) {
        logger.info({
          colIdx: col.colIdx,
          placeholder: inp.placeholder,
          value: inp.value,
          disabled: inp.disabled,
          readOnly: inp.readOnly,
          type: inp.type,
          classes: inp.classes.slice(0, 60),
        }, `  Input: "${inp.placeholder || inp.type}"`);
      }
      for (const sel of col.selects) {
        logger.info({
          colIdx: col.colIdx,
          text: sel.text,
          disabled: sel.disabled,
        }, `  Select: "${sel.text}"`);
      }
    }

    // Specifically check the Category column selector
    const editRow = page.locator('.row-table').nth(targetRow.idx);
    const catInput = editRow.locator('.input-category input');
    const catVisible = await catInput.isVisible({ timeout: 1000 }).catch(() => false);
    const catCount = await catInput.count();
    logger.info({ catVisible, catCount }, 'Category input (.input-category input)');

    if (catVisible) {
      const catPh = await catInput.getAttribute('placeholder').catch(() => '');
      const catVal = await catInput.inputValue().catch(() => '');
      const catDisabled = await catInput.isDisabled().catch(() => true);
      logger.info({ placeholder: catPh, value: catVal, disabled: catDisabled }, 'Category input details');
    }

    // Check Functional Role selector
    const roleInput = editRow.locator('.test-condition input.ant-input');
    const roleVisible = await roleInput.isVisible({ timeout: 1000 }).catch(() => false);
    const roleCount = await roleInput.count();
    logger.info({ roleVisible, roleCount }, 'Functional Role input (.test-condition input.ant-input)');

    if (roleVisible) {
      const rolePh = await roleInput.getAttribute('placeholder').catch(() => '');
      const roleVal = await roleInput.inputValue().catch(() => '');
      const roleDisabled = await roleInput.isDisabled().catch(() => true);
      logger.info({ placeholder: rolePh, value: roleVal, disabled: roleDisabled }, 'Functional Role details');
    } else {
      // Try broader selectors
      const testCondCol = editRow.locator('.test-condition');
      const tcVisible = await testCondCol.isVisible({ timeout: 500 }).catch(() => false);
      logger.info({ testCondVisible: tcVisible }, '.test-condition column');

      if (tcVisible) {
        const tcHTML = await testCondCol.evaluate(el => el.innerHTML.slice(0, 500)).catch(() => '');
        logger.info({ html: tcHTML }, '.test-condition inner HTML');
      }
    }

    // Check cost input
    const costInput = editRow.locator('input[placeholder="$/Kg"]');
    const costVisible = await costInput.isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ costVisible }, 'Cost input ($/Kg)');

    if (costVisible) {
      const costVal = await costInput.inputValue().catch(() => '');
      const costDisabled = await costInput.isDisabled().catch(() => true);
      logger.info({ value: costVal, disabled: costDisabled }, 'Cost input details');
    }

    // Now try filling the fields
    logger.info('=== TRYING TO FILL FIELDS ===');

    if (costVisible) {
      const costDisabled = await costInput.isDisabled().catch(() => true);
      if (!costDisabled) {
        await costInput.fill('5.25');
        logger.info('Filled cost: 5.25');
      }
    }

    if (catVisible) {
      const catDisabled = await catInput.isDisabled().catch(() => true);
      if (!catDisabled) {
        await catInput.fill('Abrasive');
        logger.info('Filled category: Abrasive');
      }
    }

    if (roleVisible) {
      const roleDisabled = await roleInput.isDisabled().catch(() => true);
      if (!roleDisabled) {
        await roleInput.fill('Premium dental-grade alumina abrasive');
        logger.info('Filled functional role');
      }
    }

    await page.waitForTimeout(500);
    await screenshot(page, 'diag-fields-02-filled');

    // Click checkmark
    const checkmark = editRow.locator('.add-ingredient');
    const checkVisible = await checkmark.isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ checkVisible }, 'Checkmark button');

    if (checkVisible) {
      await checkmark.click();
      await page.waitForTimeout(2000);

      const toast = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.ant-notification-notice');
        return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
      });
      logger.info({ toast: toast || '(none)' }, 'After commit');
      await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    }

    await screenshot(page, 'diag-fields-03-after-commit');

    // Check if the row is still in edit mode or committed
    const afterCommit = await page.evaluate((idx: number) => {
      const r = document.querySelectorAll('.row-table')[idx];
      if (!r) return { error: 'Row gone' };
      return {
        isAdding: r.classList.contains('addingRow'),
        classes: (r as HTMLElement).className?.slice(0, 100),
      };
    }, targetRow.idx);
    logger.info(afterCommit, 'Row state after commit');

    // Check if the NEXT row is now in edit mode (contamination check)
    const nextRowIdx = targetRow.idx + 1;
    const nextRowState = await page.evaluate((idx: number) => {
      const r = document.querySelectorAll('.row-table')[idx];
      if (!r) return { error: 'No next row' };
      return {
        isAdding: r.classList.contains('addingRow'),
        name: (r.querySelector('.variable-name') as HTMLElement)?.textContent?.trim()?.slice(0, 40) || '',
      };
    }, nextRowIdx);
    logger.info(nextRowState, 'Next row state (contamination check)');

    logger.info('=== DIAGNOSTIC COMPLETE ===');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
