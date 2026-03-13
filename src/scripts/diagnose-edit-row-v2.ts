/**
 * Diagnostic v2: Check committed row structure more thoroughly.
 * 1. Scroll right to see all columns
 * 2. Find what the enabled search input is
 * 3. Check for Confirm/checkmark column
 * 4. Check if variables can be deleted
 * 5. Check if there's a "variable definition" vs "data table" toggle
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

    await screenshot(page, 'diag-edit2-01-initial');

    // === Step 1: Get ALL columns from the first data row (including off-screen) ===
    logger.info('=== Step 1: Full column analysis ===');

    const fullRowInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      // Skip header (row 0), use row 1 (first data row)
      const row = rows[1];
      if (!row) return { error: 'No data row found' };

      // Get ALL children (columns) of the row
      const children = Array.from(row.children);
      return {
        childCount: children.length,
        children: children.map((child, idx) => {
          const el = child as HTMLElement;
          const inputs = el.querySelectorAll('input:not([type="hidden"])');
          const selects = el.querySelectorAll('.ant-select');
          return {
            idx,
            tag: el.tagName,
            classes: el.className?.slice(0, 150) || '',
            text: el.textContent?.trim()?.slice(0, 80) || '',
            width: el.offsetWidth,
            visible: el.offsetParent !== null,
            inputCount: inputs.length,
            inputs: Array.from(inputs).map(inp => ({
              placeholder: (inp as HTMLInputElement).placeholder || '',
              value: (inp as HTMLInputElement).value?.slice(0, 50) || '',
              disabled: (inp as HTMLInputElement).disabled,
              type: (inp as HTMLInputElement).type,
              parentClasses: inp.parentElement?.className?.slice(0, 80) || '',
            })),
            selectCount: selects.length,
            selects: Array.from(selects).map(sel => ({
              classes: sel.className?.toString()?.slice(0, 100) || '',
              text: (sel as HTMLElement).textContent?.trim()?.slice(0, 40) || '',
              disabled: sel.classList.contains('ant-select-disabled'),
            })),
          };
        }),
      };
    });

    if (fullRowInfo.error) {
      logger.error(fullRowInfo.error);
      return;
    }

    logger.info({ childCount: fullRowInfo.childCount }, 'Total columns in row');
    for (const col of fullRowInfo.children) {
      logger.info({
        idx: col.idx,
        classes: col.classes.slice(0, 60),
        text: col.text.slice(0, 40),
        width: col.width,
        visible: col.visible,
        inputCount: col.inputCount,
        selectCount: col.selectCount,
      }, `Col ${col.idx}`);

      // Log inputs in detail for columns that have them
      if (col.inputCount > 0) {
        for (const inp of col.inputs) {
          logger.info({
            colIdx: col.idx,
            placeholder: inp.placeholder,
            value: inp.value,
            disabled: inp.disabled,
            type: inp.type,
            parentClasses: inp.parentClasses.slice(0, 50),
          }, `  Input in col ${col.idx}`);
        }
      }
      if (col.selectCount > 0) {
        for (const sel of col.selects) {
          logger.info({
            colIdx: col.idx,
            text: sel.text,
            disabled: sel.disabled,
          }, `  Select in col ${col.idx}`);
        }
      }
    }

    // === Step 2: Scroll the table container right to reveal hidden columns ===
    logger.info('=== Step 2: Scroll table right ===');

    await page.evaluate(() => {
      // Find the scrollable container
      const containers = document.querySelectorAll('[class*="table"], [class*="scroll"], [style*="overflow"]');
      for (const container of containers) {
        const el = container as HTMLElement;
        if (el.scrollWidth > el.clientWidth) {
          el.scrollLeft = el.scrollWidth; // Scroll to far right
        }
      }
      // Also try the row's parent
      const row = document.querySelector('.row-table');
      let parent = row?.parentElement;
      while (parent) {
        if ((parent as HTMLElement).scrollWidth > (parent as HTMLElement).clientWidth) {
          (parent as HTMLElement).scrollLeft = (parent as HTMLElement).scrollWidth;
          break;
        }
        parent = parent.parentElement;
      }
    });
    await page.waitForTimeout(1000);
    await screenshot(page, 'diag-edit2-02-scrolled-right');

    // === Step 3: Check for the enabled search input (the one that's not disabled) ===
    logger.info('=== Step 3: Investigate enabled search field ===');

    const enabledInput = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      const row = rows[1]; // First data row
      if (!row) return { error: 'No row' };

      const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"])'));
      const enabledInputs = inputs.filter(inp => !(inp as HTMLInputElement).disabled);

      return enabledInputs.map(inp => {
        const el = inp as HTMLInputElement;
        // Walk up to find the column container
        let colParent = el.parentElement;
        while (colParent && colParent !== row) {
          if ((colParent as HTMLElement).className?.includes('row-table')) break;
          colParent = colParent.parentElement;
        }
        // Find the direct child of row-table that contains this input
        let directChild: Element | null = null;
        for (const child of row.children) {
          if (child.contains(inp)) {
            directChild = child;
            break;
          }
        }

        return {
          placeholder: el.placeholder,
          value: el.value?.slice(0, 50),
          type: el.type,
          parentClasses: el.parentElement?.className?.slice(0, 100) || '',
          containerClasses: directChild?.className?.slice(0, 100) || '',
          containerText: (directChild as HTMLElement)?.textContent?.trim()?.slice(0, 60) || '',
        };
      });
    });
    logger.info({ enabledInputs: enabledInput }, 'Enabled inputs in first data row');

    // === Step 4: Try clicking the enabled input and see what happens ===
    logger.info('=== Step 4: Click enabled input ===');

    // Find the enabled search input in the second row-table (first data row)
    const dataRows = page.locator('.row-table:not(.addingRow)');
    const firstDataRow = dataRows.nth(1); // nth(0) is header

    // Find enabled input in the row
    const enabledInputEl = firstDataRow.locator('input:not([disabled])').first();
    const isVisible = await enabledInputEl.isVisible({ timeout: 2000 }).catch(() => false);
    logger.info({ isVisible }, 'Enabled input visible');

    if (isVisible) {
      const placeholder = await enabledInputEl.getAttribute('placeholder');
      const type = await enabledInputEl.getAttribute('type');
      const value = await enabledInputEl.inputValue().catch(() => '');
      logger.info({ placeholder, type, value }, 'Enabled input details');

      // Click it
      await enabledInputEl.click();
      await page.waitForTimeout(1000);

      // Check if a dropdown appeared
      const dropdownVisible = await page.locator('.ant-select-dropdown').isVisible({ timeout: 1000 }).catch(() => false);
      logger.info({ dropdownVisible }, 'Dropdown appeared after clicking enabled input?');

      if (dropdownVisible) {
        const dropdownOptions = await page.evaluate(() => {
          const items = document.querySelectorAll('.ant-select-item-option');
          return Array.from(items)
            .filter(i => (i as HTMLElement).offsetParent !== null)
            .map(i => (i as HTMLElement).textContent?.trim()?.slice(0, 80) || '')
            .slice(0, 20);
        });
        logger.info({ dropdownOptions }, 'Dropdown options');
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // === Step 5: Check for any remove/delete variable mechanism ===
    logger.info('=== Step 5: Look for delete mechanism ===');

    // Check page buttons
    const pageButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons)
        .filter(b => (b as HTMLElement).offsetParent !== null)
        .map(b => ({
          text: b.textContent?.trim()?.slice(0, 60) || '',
          classes: b.className?.slice(0, 100) || '',
        }));
    });
    logger.info({ pageButtons }, 'All visible buttons');

    // Check if there's a "reset" or "clear" option
    const resetLinks = await page.evaluate(() => {
      const els = document.querySelectorAll('a, button, span');
      return Array.from(els)
        .filter(e => {
          const text = (e as HTMLElement).textContent?.toLowerCase() || '';
          return text.includes('reset') || text.includes('clear') || text.includes('remove all') || text.includes('delete all');
        })
        .map(e => ({
          tag: e.tagName,
          text: (e as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
          visible: (e as HTMLElement).offsetParent !== null,
        }));
    });
    logger.info({ resetLinks }, 'Reset/clear options');

    // === Step 6: Check the HEADER row to understand all column names ===
    logger.info('=== Step 6: Header row column names ===');

    const headerRow = dataRows.nth(0);
    const headerCols = await page.evaluate(() => {
      const row = document.querySelectorAll('.row-table')[0]; // Header
      if (!row) return [];
      return Array.from(row.children).map((child, idx) => ({
        idx,
        classes: (child as HTMLElement).className?.slice(0, 80) || '',
        text: (child as HTMLElement).textContent?.trim()?.slice(0, 100) || '',
        width: (child as HTMLElement).offsetWidth,
      }));
    });
    logger.info({ headerCols }, 'Header columns');

    // === Step 7: Look for Next button state ===
    const nextBtn = page.getByRole('button', { name: /next/i });
    const nextVisible = await nextBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const nextDisabled = nextVisible ? await nextBtn.isDisabled().catch(() => true) : true;
    logger.info({ nextVisible, nextDisabled }, 'Next button state');

    // === Step 8: Check for sidebar/step navigation to see current step name ===
    const stepInfo = await page.evaluate(() => {
      const steps = document.querySelectorAll('.step, [class*="step"], [class*="wizard"]');
      return Array.from(steps)
        .filter(s => (s as HTMLElement).offsetParent !== null)
        .map(s => ({
          text: (s as HTMLElement).textContent?.trim()?.slice(0, 60) || '',
          classes: (s as HTMLElement).className?.slice(0, 80) || '',
          active: (s as HTMLElement).className?.includes('active') ||
                  (s as HTMLElement).className?.includes('current'),
        }));
    });
    logger.info({ stepInfo }, 'Wizard steps');

    await screenshot(page, 'diag-edit2-03-final');
    logger.info('=== DIAGNOSTIC V2 COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
