/**
 * Deep dig: Find the ACTUAL "Functional Role" field for "Existing ingredient" type.
 * Catalog every ant-select in the edit row, try each one.
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
    const existOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Existing ingredient' }).first();
    await existOpt.click();
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

    // Now catalog EVERY element in the edit row — not just inputs, but all selects, divs, spans
    const editRowElements = await page.evaluate(() => {
      // Find the row that has the "+ Add" button
      const rows = document.querySelectorAll('tr');
      const editRow = Array.from(rows).reverse().find(r => {
        const btns = r.querySelectorAll('button');
        return Array.from(btns).some(b => b.textContent?.trim() === '+ Add');
      });
      if (!editRow) return { error: 'No edit row found', cells: [] };

      // Get EVERY cell and its contents
      const cells = Array.from(editRow.querySelectorAll('td')).map((td, idx) => {
        const selects = Array.from(td.querySelectorAll('.ant-select')).map(s => ({
          classes: s.className?.slice(0, 200) || '',
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 100) || '',
          hasSearch: s.querySelector('.ant-select-selection-search') !== null,
          isOpen: s.classList.contains('ant-select-open'),
          selectedValue: s.querySelector('.ant-select-selection-item')?.textContent?.trim() || '',
        }));

        const inputs = Array.from(td.querySelectorAll('input:not([type="hidden"])')).map(i => ({
          type: (i as HTMLInputElement).type,
          placeholder: (i as HTMLInputElement).placeholder || '',
          value: (i as HTMLInputElement).value?.slice(0, 50) || '',
          classes: (i as HTMLElement).className?.slice(0, 100) || '',
        }));

        return {
          idx,
          classes: td.className?.slice(0, 150) || '',
          text: td.textContent?.trim()?.slice(0, 100) || '',
          innerHTML: td.innerHTML?.slice(0, 300) || '',
          selects,
          inputs,
        };
      });

      return { error: null, cells };
    });

    if (editRowElements.error) {
      logger.error(editRowElements.error);
      return;
    }

    // Log each cell
    for (const cell of editRowElements.cells) {
      logger.info({
        idx: cell.idx,
        classes: cell.classes,
        text: cell.text.slice(0, 60),
        selects: cell.selects.length,
        inputs: cell.inputs.length,
      }, `Cell ${cell.idx}`);

      if (cell.selects.length > 0) {
        for (const sel of cell.selects) {
          logger.info({
            cellIdx: cell.idx,
            selectClasses: sel.classes.slice(0, 100),
            selectText: sel.text,
            selectedValue: sel.selectedValue,
            hasSearch: sel.hasSearch,
          }, `  Select in cell ${cell.idx}`);
        }
      }
      if (cell.inputs.length > 0) {
        for (const inp of cell.inputs) {
          logger.info({
            cellIdx: cell.idx,
            inputType: inp.type,
            placeholder: inp.placeholder,
            value: inp.value,
          }, `  Input in cell ${cell.idx}`);
        }
      }
    }

    // Also check table headers
    const headers = await page.evaluate(() => {
      const ths = document.querySelectorAll('th');
      return Array.from(ths).map((th, idx) => ({
        idx,
        text: th.textContent?.trim()?.slice(0, 60) || '',
        classes: th.className?.slice(0, 100) || '',
      }));
    });
    logger.info({ headers }, 'Table headers');

    await screenshot(page, 'diag7-edit-row-deep');

    // Now scroll right to see if there are hidden columns
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.ant-table-body, .ant-table-content, [class*="scroll"]');
      containers.forEach(c => {
        (c as HTMLElement).scrollLeft = 9999;
      });
    });
    await page.waitForTimeout(500);

    // Re-catalog after scrolling
    const afterScrollCells = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const editRow = Array.from(rows).reverse().find(r => {
        const btns = r.querySelectorAll('button');
        return Array.from(btns).some(b => b.textContent?.trim() === '+ Add');
      });
      if (!editRow) return [];

      const cells = Array.from(editRow.querySelectorAll('td')).map((td, idx) => {
        const selects = Array.from(td.querySelectorAll('.ant-select')).map(s => ({
          classes: s.className?.slice(0, 100) || '',
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 50) || '',
          selectedValue: s.querySelector('.ant-select-selection-item')?.textContent?.trim() || '',
        }));
        const inputs = Array.from(td.querySelectorAll('input:not([type="hidden"])')).map(i => ({
          placeholder: (i as HTMLInputElement).placeholder || '',
          value: (i as HTMLInputElement).value?.slice(0, 50) || '',
        }));
        return {
          idx,
          text: td.textContent?.trim()?.slice(0, 60) || '',
          selects,
          inputs,
        };
      });
      return cells;
    });
    logger.info({ cellCount: afterScrollCells.length }, 'Cells after scroll');
    for (const cell of afterScrollCells) {
      if (cell.selects.length > 0 || cell.inputs.length > 0) {
        logger.info({
          idx: cell.idx,
          text: cell.text.slice(0, 40),
          selects: cell.selects,
          inputs: cell.inputs,
        }, `After-scroll cell ${cell.idx}`);
      }
    }

    await screenshot(page, 'diag7-scrolled-right');

    // Now try: look for ANY select in the row that has no selected value
    // and isn't the type or priority select
    const unfilledSelects = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const editRow = Array.from(rows).reverse().find(r => {
        const btns = r.querySelectorAll('button');
        return Array.from(btns).some(b => b.textContent?.trim() === '+ Add');
      });
      if (!editRow) return [];

      const selects = editRow.querySelectorAll('.ant-select');
      return Array.from(selects).map((s, idx) => {
        const selectedItem = s.querySelector('.ant-select-selection-item');
        const placeholder = s.querySelector('.ant-select-selection-placeholder');
        return {
          idx,
          classes: s.className?.slice(0, 200) || '',
          selectedValue: selectedItem?.textContent?.trim() || '',
          placeholder: placeholder?.textContent?.trim() || '',
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
          rect: (s as HTMLElement).getBoundingClientRect(),
        };
      }).filter(s => s.rect.width > 0); // Only visible
    });
    logger.info({ unfilledSelects }, 'All visible selects in edit row');

    // Try clicking each unfilled select to see its options
    for (const sel of unfilledSelects) {
      // Skip known selects (type, autocomplete, priority)
      if (sel.classes.includes('select-input-type')) continue;
      if (sel.classes.includes('auto-complete')) continue;
      if (sel.selectedValue === 'Low' || sel.selectedValue === 'Medium' || sel.selectedValue === 'High') continue;
      if (sel.selectedValue === 'Existing ingredient') continue;

      logger.info({ idx: sel.idx, placeholder: sel.placeholder, selectedValue: sel.selectedValue, classes: sel.classes.slice(0, 80) }, `Exploring select ${sel.idx}`);

      // Click this select
      const selectEl = page.locator('.ant-select').nth(sel.idx);
      const selectorEl = selectEl.locator('.ant-select-selector');
      if (await selectorEl.isVisible({ timeout: 1000 }).catch(() => false)) {
        await selectorEl.click();
        await page.waitForTimeout(800);

        // Get dropdown options
        const opts = await page.evaluate(() => {
          const items = document.querySelectorAll('.ant-select-item-option');
          return Array.from(items)
            .filter(i => (i as HTMLElement).offsetParent !== null)
            .map(i => i.textContent?.trim()?.slice(0, 80) || '');
        });
        logger.info({ selectIdx: sel.idx, options: opts }, `Options for select ${sel.idx}`);

        await screenshot(page, `diag7-select-${sel.idx}-options`);

        // Close dropdown
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
