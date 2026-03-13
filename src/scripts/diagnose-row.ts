/**
 * Diagnose: Deep DOM inspection of the Inputs & Outcomes row.
 * Uses broad selectors (not table tbody tr) to find the actual row structure.
 * Tests:
 *   1. Type Of Variable dropdown interaction
 *   2. Custom variable name entry (non-library items like outcomes)
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

    // Go to Projects
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Open a project that has NO existing variables (use "Whitening Boost" or fallback)
    const projectNames = ['Whitening Boost', 'Value Engineering', 'SLS-Free Reformulation'];
    let opened = false;
    for (const pn of projectNames) {
      const row = page.locator('tr').filter({ hasText: pn }).first();
      if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
        await row.click();
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);
        logger.info(`Opened project: ${pn}`);
        opened = true;
        break;
      }
    }
    if (!opened) {
      // Just click first project row
      const firstRow = page.locator('tr').first();
      await firstRow.click();
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);
      logger.info('Opened first project');
    }

    // Navigate to Inputs & Outcomes step
    // Step 1: If on Start step, click Next
    const projectNameInput = page.locator('input[placeholder="Project Name"]');
    if (await projectNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      logger.info('On Start step — clicking Next');
      await page.getByRole('button', { name: /next/i }).click({ timeout: 10000 });
      await page.waitForTimeout(3000);
    }

    // Step 2: Upload Data — select "No Data" and click Next
    const noDataLabel = page.getByText('No Data', { exact: true });
    if (await noDataLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      logger.info('On Upload Data — selecting No Data');
      await noDataLabel.click();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /next/i }).click({ timeout: 10000 });
      await page.waitForTimeout(3000);
    }
    await dismissFloatingButton(page);
    await screenshot(page, 'diag-io-step');

    // ========== DEEP DOM INSPECTION ==========
    logger.info('=== DEEP DOM INSPECTION ===');

    // 1. Inspect the table structure (what tags wrap rows?)
    const tableStructure = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const results: any[] = [];
      tables.forEach((table, tIdx) => {
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        const trs = table.querySelectorAll('tr');
        const theadTrs = thead ? thead.querySelectorAll('tr') : [];
        const tbodyTrs = tbody ? tbody.querySelectorAll('tr') : [];

        // Get header texts
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim()?.slice(0, 40) || '');

        // Check for virtual scroll or custom wrapper
        const wrapper = table.parentElement;
        const wrapperClasses = wrapper?.className?.slice(0, 150) || '';
        const wrapperTag = wrapper?.tagName || '';

        results.push({
          tableIdx: tIdx,
          hasThead: !!thead,
          hasTbody: !!tbody,
          totalTrs: trs.length,
          theadTrs: theadTrs.length,
          tbodyTrs: tbodyTrs.length,
          headers,
          wrapperTag,
          wrapperClasses,
          tableClasses: table.className?.slice(0, 150) || '',
        });
      });
      return results;
    });
    logger.info({ tableStructure }, 'Table DOM structure');

    // 2. Find ALL .ant-select elements on page
    const allSelects = await page.evaluate(() => {
      const sels = document.querySelectorAll('.ant-select');
      return Array.from(sels).map((sel, idx) => {
        const classes = sel.className?.slice(0, 200) || '';
        const text = (sel as HTMLElement).textContent?.trim()?.slice(0, 80) || '';
        const parent = sel.parentElement;
        const parentClasses = parent?.className?.slice(0, 100) || '';
        const parentTag = parent?.tagName || '';
        // Check if inside a table cell
        const td = sel.closest('td');
        const tdIdx = td ? Array.from(td.parentElement?.children || []).indexOf(td) : -1;
        return { idx, classes, text, parentTag, parentClasses, inTd: !!td, tdIdx };
      });
    });
    logger.info({ selectCount: allSelects.length, selects: allSelects }, 'All .ant-select elements');

    // 3. Find select-input-type elements specifically
    const typeSelects = await page.evaluate(() => {
      const sels = document.querySelectorAll('.select-input-type');
      return Array.from(sels).map((sel, idx) => {
        const rect = (sel as HTMLElement).getBoundingClientRect();
        return {
          idx,
          classes: sel.className?.slice(0, 200) || '',
          text: (sel as HTMLElement).textContent?.trim()?.slice(0, 80) || '',
          visible: rect.width > 0 && rect.height > 0,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    });
    logger.info({ typeSelects }, 'Type Of Variable selects (.select-input-type)');

    // ========== TEST: Click "+ Add new" and inspect the new row ==========
    logger.info('=== CLICKING + ADD NEW ===');
    const addNewBtn = page.getByRole('button', { name: /add new/i });
    await addNewBtn.click();
    await page.waitForTimeout(1500);
    await screenshot(page, 'diag-after-add-new');

    // 4. Re-inspect table structure after adding row
    const tableAfter = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const results: any[] = [];
      tables.forEach((table, tIdx) => {
        const tbody = table.querySelector('tbody');
        const tbodyTrs = tbody ? tbody.querySelectorAll('tr') : [];
        // Get all TRs regardless of tbody
        const allTrs = table.querySelectorAll('tr');

        // For each TR, get cell count and first cell text
        const trDetails = Array.from(allTrs).map((tr, trIdx) => {
          const cells = tr.querySelectorAll('td, th');
          const firstCellText = cells[0]?.textContent?.trim()?.slice(0, 40) || '';
          const hasSelect = tr.querySelector('.ant-select') !== null;
          const hasInput = tr.querySelector('input') !== null;
          const hasAutoComplete = tr.querySelector('.ant-select-auto-complete') !== null;
          const hasTypeSelect = tr.querySelector('.select-input-type') !== null;
          return { trIdx, cellCount: cells.length, firstCellText, hasSelect, hasInput, hasAutoComplete, hasTypeSelect };
        });

        results.push({
          tableIdx: tIdx,
          tbodyTrCount: tbodyTrs.length,
          allTrCount: allTrs.length,
          trDetails,
        });
      });
      return results;
    });
    logger.info({ tableAfter }, 'Table DOM structure after Add New');

    // 5. Find the editable row (the one with autocomplete + select-input-type)
    const editableRowInfo = await page.evaluate(() => {
      // Strategy: find the TR that contains both .ant-select-auto-complete and .select-input-type
      const allTrs = document.querySelectorAll('tr');
      for (const tr of allTrs) {
        const hasAC = tr.querySelector('.ant-select-auto-complete') !== null;
        const hasType = tr.querySelector('.select-input-type') !== null;
        if (hasAC || hasType) {
          const cells = tr.querySelectorAll('td');
          const cellDetails = Array.from(cells).map((cell, cIdx) => {
            const inputs = cell.querySelectorAll('input');
            const selects = cell.querySelectorAll('.ant-select');
            return {
              cellIdx: cIdx,
              text: cell.textContent?.trim()?.slice(0, 60) || '',
              inputCount: inputs.length,
              selectCount: selects.length,
              selectClasses: Array.from(selects).map(s => s.className?.slice(0, 120) || ''),
              inputPlaceholders: Array.from(inputs).map(i => (i as HTMLInputElement).placeholder || ''),
            };
          });

          // Also check the parent structure of this TR
          const parent = tr.parentElement;
          return {
            found: true,
            hasAutoComplete: hasAC,
            hasTypeSelect: hasType,
            cellCount: cells.length,
            cellDetails,
            parentTag: parent?.tagName || '',
            parentClasses: parent?.className?.slice(0, 100) || '',
            trClasses: tr.className?.slice(0, 100) || '',
          };
        }
      }
      return { found: false };
    });
    logger.info({ editableRowInfo }, 'Editable row info');

    // ========== TEST 1: Type Of Variable dropdown ==========
    logger.info('=== TEST 1: Type Of Variable dropdown ===');

    // Find the .select-input-type in the editable row
    const typeSelectEl = page.locator('.select-input-type').last();
    const isTypeVisible = await typeSelectEl.isVisible({ timeout: 2000 }).catch(() => false);
    logger.info({ isTypeVisible }, 'Type select visible?');

    if (isTypeVisible) {
      // Try clicking the .ant-select-selector inside it (the clickable area)
      const selector = typeSelectEl.locator('.ant-select-selector');
      const hasSelectorChild = await selector.isVisible({ timeout: 1000 }).catch(() => false);
      logger.info({ hasSelectorChild }, 'Has .ant-select-selector child?');

      if (hasSelectorChild) {
        await selector.click();
      } else {
        await typeSelectEl.click({ force: true });
      }
      await page.waitForTimeout(1000);
      await screenshot(page, 'diag-type-dropdown-attempt');

      // Check what dropdown appeared
      const dropdownOptions = await page.locator('.ant-select-item-option').allTextContents();
      logger.info({ dropdownOptions }, 'Dropdown options after Type click');

      // Also check for dropdown container
      const dropdownContainers = await page.evaluate(() => {
        const dropdowns = document.querySelectorAll('.ant-select-dropdown');
        return Array.from(dropdowns).map((d, idx) => ({
          idx,
          visible: (d as HTMLElement).offsetParent !== null || window.getComputedStyle(d).display !== 'none',
          classes: d.className?.slice(0, 150) || '',
          optionCount: d.querySelectorAll('.ant-select-item-option').length,
          options: Array.from(d.querySelectorAll('.ant-select-item-option')).map(o => o.textContent?.trim() || ''),
        }));
      });
      logger.info({ dropdownContainers }, 'Dropdown containers');

      if (dropdownOptions.length > 0) {
        // Find "Ingredients" or similar option
        const ingredientOpt = page.locator('.ant-select-item-option').filter({ hasText: /ingredient/i }).first();
        if (await ingredientOpt.isVisible({ timeout: 1000 }).catch(() => false)) {
          await ingredientOpt.click();
          await page.waitForTimeout(500);
          logger.info('Selected "Ingredients" type');
        } else {
          // Just click first option
          await page.locator('.ant-select-item-option').first().click();
          await page.waitForTimeout(500);
          logger.info('Selected first type option');
        }
      } else {
        // Try alternative click approach
        logger.info('No dropdown appeared — trying alternative approaches');

        // Approach A: Click the select's search input
        const typeInput = typeSelectEl.locator('input');
        const hasTypeInput = await typeInput.isVisible({ timeout: 1000 }).catch(() => false);
        if (hasTypeInput) {
          await typeInput.click();
          await page.waitForTimeout(800);
          const opts2 = await page.locator('.ant-select-item-option').allTextContents();
          logger.info({ opts2 }, 'Options after clicking Type input');
        }

        // Approach B: Use Playwright's selectOption
        // (won't work for ant-select but worth trying)

        // Approach C: Focus then arrow down
        await typeSelectEl.focus();
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(800);
        const opts3 = await page.locator('.ant-select-item-option').allTextContents();
        logger.info({ opts3 }, 'Options after focus + ArrowDown');

        await screenshot(page, 'diag-type-dropdown-alt');

        // Close dropdown
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Verify type was set
      const typeText = await typeSelectEl.textContent().catch(() => '');
      logger.info({ typeText }, 'Type select text after interaction');
    }

    await screenshot(page, 'diag-after-type-test');

    // ========== TEST 2: Custom variable name (non-library) ==========
    logger.info('=== TEST 2: Custom variable name ===');

    // First, let's understand what happens with the autocomplete
    const autoComplete = page.locator('.ant-select-auto-complete').last();
    const acVisible = await autoComplete.isVisible({ timeout: 2000 }).catch(() => false);
    logger.info({ acVisible }, 'AutoComplete visible?');

    if (acVisible) {
      const searchInput = autoComplete.locator('input');

      // Clear and type a custom name that's NOT in the library
      await searchInput.fill('');
      await searchInput.pressSequentially('Foam Volume', { delay: 60 });
      await page.waitForTimeout(1500);

      // Screenshot the dropdown
      await screenshot(page, 'diag-custom-name-typed');

      // Check what options appeared
      const acOptions = await page.locator('.ant-select-item-option').allTextContents();
      logger.info({ acOptions, count: acOptions.length }, 'Autocomplete options for "Foam Volume"');

      // Check if there's an empty state or "create" option
      const dropdownContent = await page.evaluate(() => {
        const dropdowns = document.querySelectorAll('.ant-select-dropdown');
        return Array.from(dropdowns).map(d => {
          const visible = (d as HTMLElement).offsetParent !== null;
          const empty = d.querySelector('.ant-select-item-empty, .ant-empty');
          return {
            visible,
            hasEmpty: !!empty,
            emptyText: empty?.textContent?.trim() || '',
            innerHTML: d.innerHTML?.slice(0, 500) || '',
          };
        });
      });
      logger.info({ dropdownContent }, 'Dropdown content for custom name');

      // Try different acceptance methods:

      // Method A: Press Enter
      logger.info('Trying Enter to accept custom name...');
      await searchInput.press('Enter');
      await page.waitForTimeout(500);
      const nameAfterEnter = await searchInput.inputValue().catch(() => '');
      logger.info({ nameAfterEnter }, 'Input value after Enter');

      // Check the autocomplete's selected value
      const acTextAfterEnter = await autoComplete.textContent().catch(() => '');
      logger.info({ acTextAfterEnter }, 'AC text after Enter');

      // Method B: Clear and try Tab
      await searchInput.fill('');
      await searchInput.pressSequentially('Viscosity Index', { delay: 60 });
      await page.waitForTimeout(1000);
      logger.info('Trying Tab to accept custom name...');
      await searchInput.press('Tab');
      await page.waitForTimeout(500);
      const nameAfterTab = await searchInput.inputValue().catch(() => '');
      logger.info({ nameAfterTab }, 'Input value after Tab');

      // Method C: Clear and click away
      await searchInput.fill('');
      await searchInput.pressSequentially('pH Stability', { delay: 60 });
      await page.waitForTimeout(1000);
      logger.info('Trying click-away to accept custom name...');
      // Close dropdown first
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      // Click on another cell in the same row
      const lowerBound = page.locator('input[placeholder="lower bound"]').last();
      if (await lowerBound.isVisible({ timeout: 1000 }).catch(() => false)) {
        await lowerBound.click();
        await page.waitForTimeout(500);
      }
      const nameAfterClickAway = await searchInput.inputValue().catch(() => '');
      logger.info({ nameAfterClickAway }, 'Input value after click-away');

      await screenshot(page, 'diag-after-custom-name-tests');

      // Method D: If the autocomplete is searchable, see if typing the full name
      // and the dropdown shows "No data" we can just proceed
      await searchInput.fill('');
      await searchInput.pressSequentially('Remineralization', { delay: 60 });
      await page.waitForTimeout(1500);

      // Check dropdown state
      const dropdownState = await page.evaluate(() => {
        const dropdowns = document.querySelectorAll('.ant-select-dropdown');
        for (const d of dropdowns) {
          if ((d as HTMLElement).offsetParent !== null) {
            const items = d.querySelectorAll('.ant-select-item');
            const optItems = d.querySelectorAll('.ant-select-item-option');
            return {
              visible: true,
              totalItems: items.length,
              optionItems: optItems.length,
              itemTexts: Array.from(items).map(i => i.textContent?.trim()?.slice(0, 80) || ''),
              hasNoData: !!d.querySelector('.ant-empty, .ant-select-item-empty'),
            };
          }
        }
        return { visible: false };
      });
      logger.info({ dropdownState }, 'Dropdown state for "Remineralization"');

      // If there's an option that partially matches, try clicking it
      if (dropdownState.visible && dropdownState.optionItems > 0) {
        const firstOption = page.locator('.ant-select-item-option').first();
        const optText = await firstOption.textContent().catch(() => '');
        logger.info({ firstOptionText: optText }, 'First matching option');
      }

      await screenshot(page, 'diag-remin-dropdown');
    }

    // ========== TEST 3: Try a name from the library to verify basic flow works ==========
    logger.info('=== TEST 3: Library ingredient name ===');

    // Delete current row first by clicking any cancel/remove button, or just add a new one
    // Actually let's check if the row was already "committed" or is still editable
    const addConfirmBtns = page.locator('button').filter({ hasText: /^\+\s*Add$/ });
    const confirmCount = await addConfirmBtns.count();
    logger.info({ confirmCount }, '+ Add buttons visible');

    if (confirmCount > 0) {
      // The row is still in edit mode — let's try entering a library ingredient
      const searchInput = autoComplete.locator('input');
      await searchInput.fill('');
      await searchInput.pressSequentially('Sodium Fluoride', { delay: 60 });
      await page.waitForTimeout(1500);

      const libOptions = await page.locator('.ant-select-item-option').allTextContents();
      logger.info({ libOptions }, 'Options for "Sodium Fluoride"');

      // Click the matching option
      const sfOption = page.locator('.ant-select-item-option').filter({ hasText: /Sodium Fluoride/i }).first();
      if (await sfOption.isVisible({ timeout: 1500 }).catch(() => false)) {
        await sfOption.click();
        await page.waitForTimeout(800);
        logger.info('Clicked "Sodium Fluoride" option');

        // Check what happened to the Type Of Variable dropdown — did it auto-fill?
        const typeText = await page.locator('.select-input-type').last().textContent().catch(() => '');
        logger.info({ typeText }, 'Type select after choosing library ingredient');

        await screenshot(page, 'diag-library-name-selected');
      }
    }

    // ========== SUMMARY ==========
    logger.info('=== DIAGNOSIS COMPLETE ===');
    await screenshot(page, 'diag-final');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
