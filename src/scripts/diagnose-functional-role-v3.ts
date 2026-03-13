/**
 * Deep dig v3: Find the ACTUAL "Functional Role" field.
 * Better row detection — find ALL elements, not just in tr.
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

    // === Step 1: Find the "+ Add" button and investigate its context ===
    const addBtnInfo = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const addBtns = Array.from(buttons).filter(b => {
        const t = b.textContent?.trim() || '';
        return t === '+ Add' || t === '+Add' || t.match(/^\+\s*Add$/);
      });
      return addBtns.map(b => ({
        text: b.textContent?.trim(),
        classes: b.className?.slice(0, 100),
        visible: (b as HTMLElement).offsetParent !== null,
        parentTag: b.parentElement?.tagName,
        parentClasses: b.parentElement?.className?.slice(0, 100),
        grandparentTag: b.parentElement?.parentElement?.tagName,
        grandparentClasses: b.parentElement?.parentElement?.className?.slice(0, 100),
      }));
    });
    logger.info({ addBtnInfo }, '+ Add button context');

    // === Step 2: Find the LAST editable row (may not have button text "+ Add") ===
    // Instead, look for the row that contains .select-input-type
    const editRowData = await page.evaluate(() => {
      // Find the last .select-input-type and walk up to its tr
      const typeSelects = document.querySelectorAll('.select-input-type');
      if (typeSelects.length === 0) return { error: 'No .select-input-type found', data: null };

      const lastType = typeSelects[typeSelects.length - 1];
      let row = lastType.closest('tr');

      // If no tr, try walking up manually
      if (!row) {
        let el: HTMLElement | null = lastType as HTMLElement;
        while (el && el.tagName !== 'TR' && el.tagName !== 'BODY') {
          el = el.parentElement;
        }
        if (el?.tagName === 'TR') row = el;
      }

      if (!row) {
        // No tr found — catalog the area around the type select
        const parent = lastType.parentElement;
        const siblings = parent ? Array.from(parent.children) : [];
        return {
          error: 'No parent TR found',
          data: {
            parentTag: parent?.tagName,
            parentClasses: parent?.className?.slice(0, 200),
            siblingCount: siblings.length,
            typeSelectClasses: (lastType as HTMLElement).className?.slice(0, 200),
          }
        };
      }

      // Found the row — catalog all cells
      const cells = Array.from(row.querySelectorAll('td')).map((td, idx) => {
        const allEls = Array.from(td.querySelectorAll('*'));
        const selects = allEls.filter(e => e.classList.contains('ant-select')).map(s => ({
          classes: s.className?.slice(0, 150) || '',
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
          selectedValue: s.querySelector('.ant-select-selection-item')?.textContent?.trim() || '',
          placeholder: s.querySelector('.ant-select-selection-placeholder')?.textContent?.trim() || '',
        }));
        const inputs = allEls.filter(e => e.tagName === 'INPUT' && (e as HTMLInputElement).type !== 'hidden').map(i => ({
          placeholder: (i as HTMLInputElement).placeholder || '',
          value: (i as HTMLInputElement).value?.slice(0, 50) || '',
          parentClasses: i.parentElement?.className?.slice(0, 100) || '',
        }));
        return {
          idx,
          text: td.textContent?.trim()?.slice(0, 80) || '',
          selects,
          inputs,
          childCount: td.children.length,
        };
      });

      // Also get all buttons
      const buttons = Array.from(row.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim()?.slice(0, 50) || '',
        classes: b.className?.slice(0, 100) || '',
      }));

      return { error: null, data: { cellCount: cells.length, cells, buttons } };
    });

    if (editRowData.error) {
      logger.error({ error: editRowData.error, data: editRowData.data }, 'Edit row detection issue');
    }

    if (editRowData.data && 'cells' in editRowData.data) {
      const { cells, buttons } = editRowData.data;
      logger.info({ cellCount: cells.length, buttonCount: buttons.length }, 'Edit row found');

      for (const cell of cells) {
        logger.info({
          idx: cell.idx,
          text: cell.text.slice(0, 50),
          selectCount: cell.selects.length,
          inputCount: cell.inputs.length,
        }, `TD ${cell.idx}`);

        for (const sel of cell.selects) {
          logger.info({
            cellIdx: cell.idx,
            classes: sel.classes.slice(0, 80),
            selectedValue: sel.selectedValue,
            placeholder: sel.placeholder,
            text: sel.text.slice(0, 40),
          }, `  Select`);
        }
        for (const inp of cell.inputs) {
          logger.info({
            cellIdx: cell.idx,
            placeholder: inp.placeholder,
            value: inp.value,
            parentClasses: inp.parentClasses?.slice(0, 60),
          }, `  Input`);
        }
      }
      logger.info({ buttons }, 'Row buttons');
    }

    // === Step 3: Get table headers with column indices ===
    const headers = await page.evaluate(() => {
      const ths = document.querySelectorAll('th');
      return Array.from(ths).map((th, idx) => ({
        idx,
        text: th.textContent?.trim()?.slice(0, 60) || '',
      }));
    });
    logger.info({ headers }, 'Column headers');

    await screenshot(page, 'diag8-deep-inspection');

    // === Step 4: Now look for selects that might be "Functional Role" ===
    // It could be a select with empty value and a placeholder like "Select..." or "Choose..."
    const allPageSelects = await page.evaluate(() => {
      const selects = document.querySelectorAll('.ant-select');
      return Array.from(selects)
        .filter(s => (s as HTMLElement).offsetParent !== null)
        .map((s, idx) => ({
          idx,
          classes: s.className?.slice(0, 150) || '',
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
          selectedValue: s.querySelector('.ant-select-selection-item')?.textContent?.trim() || '',
          placeholder: s.querySelector('.ant-select-selection-placeholder')?.textContent?.trim() || '',
          isType: s.className?.includes('select-input-type') || false,
          isAutoComplete: s.className?.includes('auto-complete') || false,
        }));
    });
    logger.info({ selectCount: allPageSelects.length }, 'All visible selects');
    for (const sel of allPageSelects) {
      logger.info(sel, `Select ${sel.idx}`);
    }

    // === Step 5: Try clicking each unidentified select to see its options ===
    for (const sel of allPageSelects) {
      if (sel.isType || sel.isAutoComplete) continue;
      if (sel.selectedValue === 'Low' || sel.selectedValue === 'Medium' || sel.selectedValue === 'High') continue;
      if (sel.selectedValue === 'Existing ingredient' || sel.selectedValue === 'Hydrated Silica') continue;
      if (sel.selectedValue === 'Continuous' || sel.selectedValue === 'NA') continue;

      // This is an unidentified select — try it
      logger.info({ idx: sel.idx, placeholder: sel.placeholder, text: sel.text }, `Trying select ${sel.idx}`);

      const selectEl = page.locator('.ant-select').nth(sel.idx);
      const selectorEl = selectEl.locator('.ant-select-selector');
      if (await selectorEl.isVisible({ timeout: 1000 }).catch(() => false)) {
        await selectorEl.click();
        await page.waitForTimeout(1000);

        const opts = await page.evaluate(() => {
          const items = document.querySelectorAll('.ant-select-item-option');
          return Array.from(items)
            .filter(i => (i as HTMLElement).offsetParent !== null)
            .map(i => ({
              text: i.textContent?.trim()?.slice(0, 80) || '',
              value: (i as HTMLElement).getAttribute('title') || '',
            }));
        });
        logger.info({ selectIdx: sel.idx, options: opts }, `Options for select ${sel.idx}`);

        await screenshot(page, `diag8-select-${sel.idx}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    logger.info('=== DIAGNOSTIC COMPLETE ===');
    await screenshot(page, 'diag8-final');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
