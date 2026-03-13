/**
 * Diagnose: Find the "Functional Role" field for Existing Ingredient type,
 * and test successful multi-row commit.
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

async function setTypeOfVariable(page: Page, typeName: string): Promise<boolean> {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const typeSelect = page.locator('.select-input-type').last();
  await typeSelect.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const selector = typeSelect.locator('.ant-select-selector');
  await selector.click();
  await page.waitForTimeout(1200);

  const opt = page.locator('.ant-select-item-option').filter({ hasText: typeName }).first();
  if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await opt.click();
    await page.waitForTimeout(400);
    return true;
  }

  await page.keyboard.press('Escape');
  return false;
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

    // Go to Projects → Whitening Boost
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'WBfF' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);
    logger.info('Opened WBfF project');

    // Should be on I&O step already (has COGS per unit from diagnostic)
    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ hasAddNew }, 'On I&O step?');
    if (!hasAddNew) return;

    // ========== Step 1: Add row, set "Existing ingredient", observe what extra fields appear ==========
    logger.info('=== STEP 1: Existing ingredient with Functional Role ===');

    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Set type to "Existing ingredient"
    const typeSet = await setTypeOfVariable(page, 'Existing ingredient');
    logger.info({ typeSet }, 'Type set to Existing ingredient');

    await page.waitForTimeout(500);
    await screenshot(page, 'diag4-after-type-set');

    // Now catalog ALL form elements in the editable row to find "Functional Role"
    const formElements = await page.evaluate(() => {
      // Find all selects, inputs, and other form elements
      const selects = document.querySelectorAll('.ant-select');
      const selectInfo = Array.from(selects).map((sel, idx) => ({
        idx,
        classes: sel.className?.slice(0, 200) || '',
        text: (sel as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
        visible: (sel as HTMLElement).offsetParent !== null,
      }));

      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      const inputInfo = Array.from(inputs).map((inp, idx) => ({
        idx,
        type: (inp as HTMLInputElement).type,
        placeholder: (inp as HTMLInputElement).placeholder || '',
        value: (inp as HTMLInputElement).value?.slice(0, 50) || '',
        visible: (inp as HTMLElement).offsetParent !== null,
      }));

      return { selects: selectInfo, inputs: inputInfo };
    });

    // Filter to visible elements
    const visSelects = formElements.selects.filter(s => s.visible);
    const visInputs = formElements.inputs.filter(i => i.visible);
    logger.info({ visibleSelects: visSelects }, 'All visible selects');
    logger.info({ visibleInputs: visInputs }, 'All visible inputs');

    // Look for anything with "role" or "function" in classes
    const roleElements = await page.evaluate(() => {
      const all = document.querySelectorAll('[class*="role"], [class*="Role"], [class*="function"], [class*="Function"], [placeholder*="role"], [placeholder*="Role"]');
      return Array.from(all).map(el => ({
        tag: el.tagName,
        classes: el.className?.slice(0, 200) || '',
        text: (el as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });
    logger.info({ roleElements }, 'Elements with "role/function" in classes/placeholder');

    // Now try selecting the library ingredient name
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.click();
    await page.waitForTimeout(300);
    await acInput.fill('');
    await acInput.pressSequentially('Hydrogen Peroxide', { delay: 50 });
    await page.waitForTimeout(1500);

    const hpOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Hydrogen Peroxide' }).first();
    if (await hpOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hpOpt.click();
      await page.waitForTimeout(800);
      logger.info('Selected Hydrogen Peroxide');
    }

    await screenshot(page, 'diag4-after-ingredient-selected');

    // Re-catalog to see if new fields appeared after selecting ingredient
    const formElements2 = await page.evaluate(() => {
      const selects = document.querySelectorAll('.ant-select');
      const selectInfo = Array.from(selects).filter(s => (s as HTMLElement).offsetParent !== null).map((sel, idx) => ({
        idx,
        classes: sel.className?.slice(0, 200) || '',
        text: (sel as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
      }));

      // Look for any new dropdown/select that appeared
      const newSelects = selectInfo.filter(s =>
        !s.classes.includes('auto-complete') &&
        !s.classes.includes('select-input-type') &&
        s.text !== 'Continuous' &&
        s.text !== 'Low'
      );

      return { allVisibleSelects: selectInfo, newSelects };
    });
    logger.info({ selects: formElements2.allVisibleSelects }, 'Selects after ingredient selected');
    logger.info({ newSelects: formElements2.newSelects }, 'New/unknown selects');

    // Check the table headers / column structure
    const tableHeaders = await page.evaluate(() => {
      const ths = document.querySelectorAll('th');
      return Array.from(ths).map(th => th.textContent?.trim()?.slice(0, 60) || '');
    });
    logger.info({ tableHeaders }, 'Table headers');

    // Set bounds
    await page.locator('input[placeholder="lower bound"]').last().fill('1');
    await page.locator('input[placeholder="upper bound"]').last().fill('3');

    // Set unit
    const unitInput = page.locator('input[placeholder="%/grm"]').last();
    if (await unitInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await unitInput.fill('%');
    }

    // Now try to commit — and observe the error toast in detail
    await screenshot(page, 'diag4-before-commit');

    const addBtn = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      await page.waitForTimeout(2000);
    }

    await screenshot(page, 'diag4-after-commit-attempt');

    // Get detailed error info
    const errorDetails = await page.evaluate(() => {
      const notifications = document.querySelectorAll('.ant-notification-notice');
      return Array.from(notifications).map(n => ({
        text: n.textContent?.trim()?.slice(0, 300) || '',
        innerHTML: n.innerHTML?.slice(0, 500) || '',
      }));
    });
    logger.info({ errorDetails }, 'Error notification details');

    // Dismiss notification
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(300);

    // Now scroll right to see if there are more columns (Functional Role might be a hidden column)
    await page.evaluate(() => {
      const tableContainer = document.querySelector('.ant-table-body, [class*="table-container"], [class*="scroll"]');
      if (tableContainer) {
        tableContainer.scrollLeft = 9999;
      }
    });
    await page.waitForTimeout(500);
    await screenshot(page, 'diag4-scrolled-right');

    // Check if there are more visible fields/selects after scrolling
    const afterScrollSelects = await page.evaluate(() => {
      const selects = document.querySelectorAll('.ant-select');
      return Array.from(selects).filter(s => (s as HTMLElement).offsetParent !== null).map(sel => ({
        classes: sel.className?.slice(0, 200) || '',
        text: (sel as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
      }));
    });
    logger.info({ afterScrollSelects }, 'Selects after scroll right');

    // ========== Step 2: Try "Analytical outcome" type instead — does it need Functional Role? ==========
    logger.info('=== STEP 2: Try Analytical outcome instead ===');

    // The failed row is still there — let's try changing its Type to Analytical outcome
    const typeSelect2 = page.locator('.select-input-type').last();
    const typeSelector2 = typeSelect2.locator('.ant-select-selector');
    await typeSelector2.click();
    await page.waitForTimeout(1200);

    const analytOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Analytical outcome' }).first();
    if (await analytOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analytOpt.click();
      await page.waitForTimeout(500);
      logger.info('Changed type to Analytical outcome');
    }

    // Try commit again
    const addBtn2 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn2.click();
      await page.waitForTimeout(2000);
    }

    const result2 = await page.evaluate(() => {
      const notifications = document.querySelectorAll('.ant-notification-notice');
      return Array.from(notifications).map(n => n.textContent?.trim()?.slice(0, 300) || '');
    });
    logger.info({ result2 }, 'After changing to Analytical outcome');

    await screenshot(page, 'diag4-analytical-commit');

    // Dismiss
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(300);

    // ========== Step 3: Check if "Category" column is the Functional Role ==========
    logger.info('=== STEP 3: Check Category column ===');

    // The table headers include "Category" — this might be the "Functional Role"
    // Let's find all selects that aren't type/priority/autocomplete and check if Category is one
    const catSelect = page.locator('.ant-select').filter({ hasNotText: /Existing|Processing|Analytical|Sensory|Consumer|Filler|Recipe|Continuous|Low|Medium|High/ });
    const catCount = await catSelect.count();
    logger.info({ catCount }, 'Unidentified selects (possible Category/Functional Role)');

    for (let i = 0; i < catCount; i++) {
      const sel = catSelect.nth(i);
      const visible = await sel.isVisible().catch(() => false);
      const text = await sel.textContent().catch(() => '');
      const classes = await sel.getAttribute('class').catch(() => '');
      logger.info({ i, visible, text: text?.trim(), classes: classes?.slice(0, 100) }, `Unidentified select ${i}`);
    }

    logger.info('=== DIAGNOSTIC COMPLETE ===');
    await screenshot(page, 'diag4-final');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
