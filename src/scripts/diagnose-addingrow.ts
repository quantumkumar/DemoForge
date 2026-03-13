/**
 * Find ALL form elements inside .row-table.addingRow,
 * and test different ways to fill the Category/Functional Role.
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

    // Click Add new
    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Set type to "Existing ingredient"
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const typeSelect = page.locator('.select-input-type').last();
    await typeSelect.locator('.ant-select-selector').click();
    await page.waitForTimeout(1200);
    await page.locator('.ant-select-item-option').filter({ hasText: 'Existing ingredient' }).first().click();
    await page.waitForTimeout(400);
    logger.info('Set type: Existing ingredient');

    // Select ingredient
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

    // === Catalog everything inside .addingRow ===
    const addingRowData = await page.evaluate(() => {
      const row = document.querySelector('.addingRow');
      if (!row) return { error: 'No .addingRow found' };

      // Full HTML structure (abbreviated)
      const fullHTML = row.innerHTML;

      // All direct child divs (columns)
      const columns = Array.from(row.children).map((child, idx) => ({
        idx,
        tag: child.tagName,
        classes: child.className?.slice(0, 200) || '',
        text: (child as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
        childCount: child.children.length,
      }));

      // All inputs inside
      const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"])')).map((inp, idx) => ({
        idx,
        type: (inp as HTMLInputElement).type,
        placeholder: (inp as HTMLInputElement).placeholder || '',
        value: (inp as HTMLInputElement).value?.slice(0, 50) || '',
        parentClasses: inp.parentElement?.className?.slice(0, 100) || '',
        visible: (inp as HTMLElement).offsetParent !== null,
      }));

      // All selects inside
      const selects = Array.from(row.querySelectorAll('.ant-select')).map((sel, idx) => ({
        idx,
        classes: sel.className?.slice(0, 150) || '',
        text: (sel as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
        selectedValue: sel.querySelector('.ant-select-selection-item')?.textContent?.trim() || '',
        placeholder: sel.querySelector('.ant-select-selection-placeholder')?.textContent?.trim() || '',
      }));

      // All buttons
      const buttons = Array.from(row.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim()?.slice(0, 50) || '',
        classes: b.className?.slice(0, 100) || '',
      }));

      // All labels or spans that might indicate field names
      const labels = Array.from(row.querySelectorAll('label, .ant-form-item-label, span[class*="label"]')).map(l => ({
        tag: l.tagName,
        text: (l as HTMLElement).textContent?.trim()?.slice(0, 50) || '',
        classes: l.className?.slice(0, 100) || '',
      }));

      return {
        error: null,
        columnCount: columns.length,
        columns,
        inputCount: inputs.length,
        inputs,
        selectCount: selects.length,
        selects,
        buttonCount: buttons.length,
        buttons,
        labelCount: labels.length,
        labels,
        htmlLength: fullHTML.length,
        htmlSnippet: fullHTML.slice(0, 1000),
      };
    });

    if (addingRowData.error) {
      logger.error(addingRowData.error);
      return;
    }

    logger.info({ columns: addingRowData.columns }, 'Adding row columns');
    logger.info({ inputs: addingRowData.inputs }, 'Adding row inputs');
    logger.info({ selects: addingRowData.selects }, 'Adding row selects');
    logger.info({ buttons: addingRowData.buttons }, 'Adding row buttons');
    logger.info({ labels: addingRowData.labels }, 'Adding row labels');
    logger.info({ htmlSnippet: addingRowData.htmlSnippet }, 'Row HTML (first 1000 chars)');

    await screenshot(page, 'diag9-addingrow');

    // === Now try: Click the category input, type with keyboard, then Tab ===
    logger.info('=== Testing keyboard input for Category field ===');

    const catInput = page.locator('.input-category input').last();
    const catVisible = await catInput.isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ catVisible }, 'Category input visible via .input-category?');

    if (catVisible) {
      // Method 1: click, triple-click to select all, then type, then Tab
      await catInput.click();
      await page.waitForTimeout(200);
      await catInput.click({ clickCount: 3 });
      await page.waitForTimeout(100);
      await page.keyboard.type('Abrasive', { delay: 30 });
      await page.waitForTimeout(300);

      // Verify
      const val1 = await catInput.inputValue().catch(() => '');
      logger.info({ val1 }, 'Category value after keyboard.type');

      // Tab out
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);

      // Verify still set
      const val2 = await catInput.inputValue().catch(() => '');
      logger.info({ val2 }, 'Category value after Tab');
    }

    // Set bounds
    await page.locator('.addingRow input[placeholder="lower bound"]').fill('15');
    await page.locator('.addingRow input[placeholder="upper bound"]').fill('25');
    await page.waitForTimeout(200);

    // Set unit
    const unitInput = page.locator('.addingRow input[placeholder="%/grm"]');
    if (await unitInput.isVisible({ timeout: 500 }).catch(() => false)) {
      await unitInput.fill('%');
    }

    await screenshot(page, 'diag9-before-commit');

    // Now before committing, check what the React component "sees"
    // Try reading the React fiber/state
    const reactState = await page.evaluate(() => {
      const catInput = document.querySelector('.input-category input') as HTMLInputElement;
      if (!catInput) return { error: 'No category input found' };

      // Check React internal state
      const fiberKey = Object.keys(catInput).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      const propsKey = Object.keys(catInput).find(k => k.startsWith('__reactProps$'));

      return {
        value: catInput.value,
        defaultValue: catInput.defaultValue,
        hasFiber: !!fiberKey,
        hasProps: !!propsKey,
        keys: Object.keys(catInput).filter(k => k.startsWith('__')),
        attributes: Array.from(catInput.attributes).map(a => `${a.name}=${a.value?.slice(0, 30)}`),
      };
    });
    logger.info({ reactState }, 'Category input React state');

    // Try to dispatch React-compatible events
    await page.evaluate(() => {
      const catInput = document.querySelector('.input-category input') as HTMLInputElement;
      if (!catInput) return;

      // Set value via native setter to trigger React
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(catInput, 'Abrasive');
      }

      // Dispatch React-compatible events
      catInput.dispatchEvent(new Event('input', { bubbles: true }));
      catInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);

    // Verify
    const val3 = await page.locator('.input-category input').last().inputValue().catch(() => '');
    logger.info({ val3 }, 'Category value after native setter + events');

    // Now commit
    const addBtn = page.locator('.add-ingredient').last();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Fallback
      const addBtn2 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
      if (await addBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addBtn2.click();
        await page.waitForTimeout(2000);
      }
    }

    const toast = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-notification-notice');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
    });
    logger.info({ toast }, 'Commit result after native setter approach');

    await screenshot(page, 'diag9-after-commit');
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(500);

    // === If still failing, maybe "Functional Role" is NOT the Category field ===
    // Let's check: what if we fill BOTH the category AND the description?
    if (toast.includes('Functional Role')) {
      logger.info('=== Still failing — trying to fill description too ===');

      // Cancel/remove the failed row... but we know there's no cancel button
      // Try: add another row and fill everything including description

      await page.getByRole('button', { name: /add new/i }).click();
      await page.waitForTimeout(1500);

      // Set type
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const ts = page.locator('.select-input-type').last();
      await ts.locator('.ant-select-selector').click();
      await page.waitForTimeout(1200);
      await page.locator('.ant-select-item-option').filter({ hasText: 'Existing ingredient' }).first().click();
      await page.waitForTimeout(400);

      // Select ingredient
      const ac = page.locator('.ant-select-auto-complete input').last();
      await ac.click();
      await page.waitForTimeout(300);
      await ac.fill('');
      await ac.pressSequentially('Glycerin', { delay: 50 });
      await page.waitForTimeout(1500);
      const gOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Glycerin' }).first();
      if (await gOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await gOpt.click();
        await page.waitForTimeout(800);
      }

      // Fill ALL fields in .addingRow (last one)
      const addingRow = page.locator('.addingRow').last();

      // Fill category using native setter approach
      await page.evaluate(() => {
        const rows = document.querySelectorAll('.addingRow');
        const lastRow = rows[rows.length - 1];
        if (!lastRow) return;

        const catInput = lastRow.querySelector('.input-category input') as HTMLInputElement;
        if (catInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(catInput, 'Humectant');
          catInput.dispatchEvent(new Event('input', { bubbles: true }));
          catInput.dispatchEvent(new Event('change', { bubbles: true }));
          catInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        // Also fill description
        const descInputs = lastRow.querySelectorAll('input.ant-input');
        for (const inp of descInputs) {
          const placeholder = (inp as HTMLInputElement).placeholder;
          if (placeholder.includes('emulsifier') || placeholder.includes('Powdered')) {
            const setter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter2) setter2.call(inp, 'Primary humectant, prevents drying');
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      await page.waitForTimeout(300);

      // Also fill bounds
      await addingRow.locator('input[placeholder="lower bound"]').fill('18');
      await addingRow.locator('input[placeholder="upper bound"]').fill('30');
      await page.waitForTimeout(200);

      // Fill unit
      const uInput = addingRow.locator('input[placeholder="%/grm"]');
      if (await uInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await uInput.fill('%');
      }

      // Fill cost
      const costInput = addingRow.locator('input[placeholder="$/Kg"]');
      if (await costInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await costInput.fill('1.50');
      }

      await screenshot(page, 'diag9-all-fields-filled');

      // Verify all field values
      const allValues = await page.evaluate(() => {
        const rows = document.querySelectorAll('.addingRow');
        const lastRow = rows[rows.length - 1];
        if (!lastRow) return {};

        const inputs = lastRow.querySelectorAll('input:not([type="hidden"])');
        const result: Record<string, string> = {};
        inputs.forEach((inp, idx) => {
          const el = inp as HTMLInputElement;
          result[`input-${idx}-${el.placeholder || el.type}`] = el.value || '(empty)';
        });
        return result;
      });
      logger.info({ allValues }, 'All field values before commit');

      // Commit
      const addBtnLast = addingRow.locator('.add-ingredient');
      if (await addBtnLast.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addBtnLast.click();
        await page.waitForTimeout(2000);
      }

      const toast2 = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.ant-notification-notice');
        return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
      });
      logger.info({ toast2 }, 'Commit result with all fields filled');

      await screenshot(page, 'diag9-all-fields-result');
      await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    }

    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
