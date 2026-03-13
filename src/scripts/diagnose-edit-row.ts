/**
 * Diagnostic: Test editing a committed row on the I&O Variable Definition view.
 * Goal: Discover how to click a committed row → enter edit mode → fill metadata → save.
 *
 * Tests on GPT project (Gen-Z Probiotic) which has 14 committed rows with Type=Processing.
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

    // Check if we're on the I&O variable definition view
    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ hasAddNew }, 'On variable definition view?');

    await screenshot(page, 'diag-edit-01-initial');

    // === Step 1: Catalog all committed rows ===
    const committedRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      return Array.from(rows).map((row, idx) => {
        // Get variable name
        const nameInput = row.querySelector('.ant-select-auto-complete input') as HTMLInputElement;
        const nameCol = row.querySelector('.variable-name') as HTMLElement;
        const name = nameInput?.value || nameCol?.textContent?.trim() || '(unknown)';

        // Get type
        const typeSelect = row.querySelector('.select-input-type');
        const typeText = typeSelect?.textContent?.trim() || '(unknown)';

        // Get all inputs
        const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"])')).map(inp => ({
          placeholder: (inp as HTMLInputElement).placeholder || '',
          value: (inp as HTMLInputElement).value?.slice(0, 30) || '',
          disabled: (inp as HTMLInputElement).disabled,
          type: (inp as HTMLInputElement).type,
        }));

        // Get actions column (buttons/icons)
        const actionsCol = row.querySelector('.actions-column');
        const actionButtons = actionsCol ? Array.from(actionsCol.querySelectorAll('button, .anticon, svg, [role="img"]')).map(b => ({
          tag: b.tagName,
          classes: b.className?.toString()?.slice(0, 100) || '',
          text: (b as HTMLElement).textContent?.trim()?.slice(0, 30) || '',
          title: (b as HTMLElement).getAttribute('title') || '',
          ariaLabel: (b as HTMLElement).getAttribute('aria-label') || '',
        })) : [];

        // Check for confirm/checkmark column
        const confirmCol = row.querySelector('.add-ingredient');
        const confirmVisible = confirmCol ? (confirmCol as HTMLElement).offsetParent !== null : false;

        // Check all clickable elements
        const clickables = Array.from(row.querySelectorAll('button, [role="button"], .anticon')).map(el => ({
          tag: el.tagName,
          classes: el.className?.toString()?.slice(0, 80) || '',
          text: (el as HTMLElement).textContent?.trim()?.slice(0, 30) || '',
        }));

        return {
          idx,
          name: name.slice(0, 40),
          type: typeText.slice(0, 30),
          inputCount: inputs.length,
          inputs,
          actionButtons,
          confirmVisible,
          clickables,
          rowClasses: (row as HTMLElement).className?.slice(0, 100) || '',
        };
      });
    });

    logger.info({ rowCount: committedRows.length }, 'Committed rows found');
    for (const row of committedRows.slice(0, 3)) {
      logger.info(row, `Row ${row.idx}: ${row.name}`);
    }

    if (committedRows.length === 0) {
      logger.error('No committed rows found. Cannot test editing.');
      return;
    }

    // === Step 2: Try clicking the first committed row ===
    const firstRow = page.locator('.row-table:not(.addingRow)').first();
    logger.info('=== Clicking first committed row ===');

    // Screenshot before click
    await screenshot(page, 'diag-edit-02-before-click');

    // Try clicking the row itself
    await firstRow.click();
    await page.waitForTimeout(1500);

    // Check if anything changed
    const afterClickState = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      const firstRow = rows[0];
      if (!firstRow) return { error: 'No row' };

      const inputs = Array.from(firstRow.querySelectorAll('input:not([type="hidden"])')).map(inp => ({
        placeholder: (inp as HTMLInputElement).placeholder || '',
        disabled: (inp as HTMLInputElement).disabled,
        readOnly: (inp as HTMLInputElement).readOnly,
      }));

      // Check if any addingRow appeared
      const addingRows = document.querySelectorAll('.addingRow');

      return {
        inputsDisabled: inputs.map(i => i.disabled),
        inputsReadOnly: inputs.map(i => i.readOnly),
        addingRowCount: addingRows.length,
        rowClasses: (firstRow as HTMLElement).className?.slice(0, 150) || '',
      };
    });
    logger.info(afterClickState, 'After clicking first row');

    await screenshot(page, 'diag-edit-03-after-click');

    // === Step 3: Try clicking the actions column / edit icon ===
    logger.info('=== Trying to find edit button in actions column ===');

    const editBtnInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      const firstRow = rows[0];
      if (!firstRow) return { error: 'No row' };

      // Look for edit icon/button
      const actionsCol = firstRow.querySelector('.actions-column');
      const allIcons = firstRow.querySelectorAll('.anticon, svg, [class*="icon"], [class*="edit"], [class*="pencil"]');

      return {
        hasActionsCol: !!actionsCol,
        actionsColHTML: actionsCol?.innerHTML?.slice(0, 500) || '',
        iconCount: allIcons.length,
        icons: Array.from(allIcons).map(ic => ({
          tag: ic.tagName,
          classes: ic.className?.toString()?.slice(0, 100) || '',
          parentClasses: ic.parentElement?.className?.toString()?.slice(0, 80) || '',
        })),
      };
    });
    logger.info(editBtnInfo, 'Edit button search');

    // Try clicking the add-ingredient / confirm icon on first row
    const confirmIcon = firstRow.locator('.add-ingredient').first();
    const confirmVisible = await confirmIcon.isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ confirmVisible }, 'Confirm icon visible on committed row?');

    if (confirmVisible) {
      logger.info('=== Clicking confirm icon on committed row ===');
      await confirmIcon.click();
      await page.waitForTimeout(1500);

      const afterConfirmClick = await page.evaluate(() => {
        const rows = document.querySelectorAll('.row-table');
        return Array.from(rows).map((row, idx) => ({
          idx,
          isAdding: row.classList.contains('addingRow'),
          classes: (row as HTMLElement).className?.slice(0, 100) || '',
        }));
      });
      logger.info({ afterConfirmClick }, 'After clicking confirm icon');
      await screenshot(page, 'diag-edit-04-after-confirm-click');
    }

    // === Step 4: Try double-clicking a row ===
    logger.info('=== Trying double-click on row ===');
    const secondRow = page.locator('.row-table:not(.addingRow)').nth(1);
    if (await secondRow.isVisible({ timeout: 1000 }).catch(() => false)) {
      await secondRow.dblclick();
      await page.waitForTimeout(1500);

      const afterDblClick = await page.evaluate(() => {
        const rows = document.querySelectorAll('.row-table');
        return Array.from(rows).map((row, idx) => ({
          idx,
          isAdding: row.classList.contains('addingRow'),
          inputsDisabled: Array.from(row.querySelectorAll('input:not([type="hidden"])')).map(i => (i as HTMLInputElement).disabled),
        }));
      });
      logger.info({ afterDblClick }, 'After double-click');
      await screenshot(page, 'diag-edit-05-after-dblclick');
    }

    // === Step 5: Look for any edit triggers in the entire page ===
    logger.info('=== Looking for edit triggers on page ===');

    const editTriggers = await page.evaluate(() => {
      // Look for edit, pencil, modify icons/buttons anywhere
      const editEls = document.querySelectorAll('[class*="edit"], [class*="pencil"], [class*="modify"], [aria-label*="edit"], [title*="edit"], [title*="Edit"]');
      return Array.from(editEls).map(el => ({
        tag: el.tagName,
        classes: el.className?.toString()?.slice(0, 100) || '',
        text: (el as HTMLElement).textContent?.trim()?.slice(0, 40) || '',
        title: (el as HTMLElement).getAttribute('title') || '',
        ariaLabel: (el as HTMLElement).getAttribute('aria-label') || '',
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });
    logger.info({ editTriggers }, 'Edit triggers on page');

    // === Step 6: Check for "Edit" context menu or right-click options ===
    // Skip right-click for now; check if there's a kebab/3-dot menu
    const kebabMenus = await page.evaluate(() => {
      const dots = document.querySelectorAll('[class*="more"], [class*="ellipsis"], [class*="dots"], [class*="kebab"], .anticon-more, .anticon-ellipsis');
      return Array.from(dots).map(el => ({
        tag: el.tagName,
        classes: el.className?.toString()?.slice(0, 100) || '',
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });
    logger.info({ kebabMenus }, 'Kebab/more menus');

    // === Step 7: Try a different approach — just delete and re-add ===
    // Check if there's a delete button on committed rows
    const deleteInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      const firstRow = rows[0];
      if (!firstRow) return { error: 'No row' };

      const deleteEls = firstRow.querySelectorAll('[class*="delete"], [class*="remove"], [class*="trash"], .anticon-delete, .anticon-close');
      return {
        deleteCount: deleteEls.length,
        deletes: Array.from(deleteEls).map(el => ({
          tag: el.tagName,
          classes: el.className?.toString()?.slice(0, 100) || '',
          visible: (el as HTMLElement).offsetParent !== null,
          parentClasses: el.parentElement?.className?.toString()?.slice(0, 80) || '',
        })),
      };
    });
    logger.info(deleteInfo, 'Delete buttons on rows');

    // Also check full row HTML of first row
    const firstRowHTML = await page.evaluate(() => {
      const rows = document.querySelectorAll('.row-table:not(.addingRow)');
      if (rows.length === 0) return '';
      return (rows[0] as HTMLElement).innerHTML.slice(0, 2000);
    });
    logger.info({ htmlLength: firstRowHTML.length, html: firstRowHTML.slice(0, 1000) }, 'First row HTML');

    await screenshot(page, 'diag-edit-06-final');
    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
