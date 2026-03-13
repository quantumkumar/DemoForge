/**
 * Diagnose: Test the Category/Functional Role field for "Existing ingredient" type,
 * test "Filler ingredient" type (does it need Category?),
 * test error recovery (cancel pending rows),
 * and test full successful commit with Category filled.
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

async function cancelPendingRow(page: Page): Promise<boolean> {
  // Look for cancel/delete buttons on pending rows
  // Pending rows have a "+ Add" button — look for cancel/X near it
  const addBtn = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
  if (!await addBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    return false; // No pending row
  }

  // Try finding a cancel/delete/X button near the pending row
  // Check for delete icon buttons
  const deleteIcons = page.locator('button').filter({ hasText: /delete|cancel|remove|×|✕/i });
  const delCount = await deleteIcons.count();
  logger.info({ delCount }, 'Delete/cancel buttons found');

  // Check for icon-only buttons (trash, X icons)
  const iconButtons = page.locator('.ant-btn-icon-only, [class*="delete"], [class*="remove"], [class*="cancel"]');
  const iconCount = await iconButtons.count();
  logger.info({ iconCount }, 'Icon-only/delete/cancel elements');

  // Check all visible buttons in the last table row
  const rowButtons = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    const lastEditRow = Array.from(rows).reverse().find(r => {
      const btns = r.querySelectorAll('button');
      return Array.from(btns).some(b => b.textContent?.trim() === '+ Add');
    });
    if (!lastEditRow) return [];
    const btns = lastEditRow.querySelectorAll('button, [role="button"], .anticon');
    return Array.from(btns).map(b => ({
      tag: b.tagName,
      text: b.textContent?.trim()?.slice(0, 50) || '',
      classes: b.className?.slice(0, 150) || '',
      visible: (b as HTMLElement).offsetParent !== null,
    }));
  });
  logger.info({ rowButtons }, 'All buttons/icons in pending row');

  // Try clicking a delete/cancel button
  for (const btn of rowButtons) {
    if (btn.classes.includes('delete') || btn.classes.includes('cancel') || btn.classes.includes('close')) {
      const el = page.locator(`.${btn.classes.split(' ').find(c => c.includes('delete') || c.includes('cancel') || c.includes('close'))}`).last();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.click();
        await page.waitForTimeout(500);
        return true;
      }
    }
  }

  // Try clicking anticon-delete or anticon-close
  const antIconDelete = page.locator('.anticon-delete, .anticon-close, .anticon-close-circle').last();
  if (await antIconDelete.isVisible({ timeout: 500 }).catch(() => false)) {
    await antIconDelete.click();
    await page.waitForTimeout(500);
    return true;
  }

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

    // Go to Projects → WBfF (Whitening Boost)
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'WBfF' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);
    logger.info('Opened WBfF project');

    // Check if on I&O step
    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ hasAddNew }, 'On I&O step?');
    if (!hasAddNew) {
      logger.error('Not on I&O step');
      return;
    }

    // Count existing committed rows
    const existingRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      let count = 0;
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;
        const text = row.textContent?.trim() || '';
        if (text.includes('Variable Name') || text.includes('+ Add new')) continue;
        const hasAddConfirm = Array.from(row.querySelectorAll('button'))
          .some(b => b.textContent?.trim() === '+ Add');
        if (!hasAddConfirm && text.length > 10) count++;
      }
      return count;
    });
    logger.info({ existingRows }, 'Existing committed rows');

    // ========== TEST 1: Explore Category field for "Existing ingredient" ==========
    logger.info('=== TEST 1: Explore Category/Functional Role field ===');

    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Set type to "Existing ingredient"
    const typeSet = await setTypeOfVariable(page, 'Existing ingredient');
    logger.info({ typeSet }, 'Type set to Existing ingredient');

    // Select a library ingredient
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.click();
    await page.waitForTimeout(300);
    await acInput.fill('');
    await acInput.pressSequentially('Glycerin', { delay: 50 });
    await page.waitForTimeout(1500);

    const glycOpt = page.locator('.ant-select-item-option').filter({ hasText: 'Glycerin' }).first();
    if (await glycOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glycOpt.click();
      await page.waitForTimeout(800);
      logger.info('Selected Glycerin');
    }

    // Now find ALL inputs and their placeholders — look for the Category input
    const allInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      return Array.from(inputs)
        .filter(i => (i as HTMLElement).offsetParent !== null)
        .map((inp, idx) => ({
          idx,
          type: (inp as HTMLInputElement).type,
          placeholder: (inp as HTMLInputElement).placeholder || '',
          value: (inp as HTMLInputElement).value?.slice(0, 50) || '',
          id: (inp as HTMLInputElement).id || '',
          name: (inp as HTMLInputElement).name || '',
          classes: (inp as HTMLElement).className?.slice(0, 100) || '',
          parentClasses: (inp.parentElement?.className || '').slice(0, 100),
        }));
    });
    logger.info({ allInputs }, 'All visible inputs after selecting ingredient');

    // Find input with placeholder "Liquid" or similar
    const categoryInput = allInputs.find(i =>
      i.placeholder.toLowerCase().includes('liquid') ||
      i.placeholder.toLowerCase().includes('category') ||
      i.placeholder.toLowerCase().includes('role') ||
      i.placeholder.toLowerCase().includes('function')
    );
    logger.info({ categoryInput }, 'Category/Functional Role input');

    // Try clicking the Category input
    if (categoryInput) {
      const catInputEl = page.locator(`input[placeholder="${categoryInput.placeholder}"]`).last();
      await catInputEl.click();
      await page.waitForTimeout(800);

      // Check if a dropdown appeared
      const dropdownOptions = await page.evaluate(() => {
        const opts = document.querySelectorAll('.ant-select-item-option');
        return Array.from(opts)
          .filter(o => (o as HTMLElement).offsetParent !== null)
          .map(o => o.textContent?.trim()?.slice(0, 80) || '');
      });
      logger.info({ dropdownOptions }, 'Category dropdown options (if any)');

      await screenshot(page, 'diag5-category-dropdown');

      // Try typing "Humectant" in the category field
      await catInputEl.fill('');
      await catInputEl.pressSequentially('Humectant', { delay: 50 });
      await page.waitForTimeout(800);

      // Check if autocomplete showed options
      const catAutoOpts = await page.evaluate(() => {
        const opts = document.querySelectorAll('.ant-select-item-option');
        return Array.from(opts)
          .filter(o => (o as HTMLElement).offsetParent !== null)
          .map(o => o.textContent?.trim()?.slice(0, 80) || '');
      });
      logger.info({ catAutoOpts }, 'Category autocomplete after typing "Humectant"');

      // If autocomplete, click match; else press Enter
      const humMatch = page.locator('.ant-select-item-option').filter({ hasText: 'Humectant' }).first();
      if (await humMatch.isVisible({ timeout: 1000 }).catch(() => false)) {
        await humMatch.click();
        await page.waitForTimeout(400);
        logger.info('Selected Humectant from dropdown');
      } else {
        await catInputEl.press('Enter');
        await page.waitForTimeout(400);
        logger.info('Pressed Enter for Humectant');
      }
    }

    // Set bounds
    await page.locator('input[placeholder="lower bound"]').last().fill('20');
    await page.locator('input[placeholder="upper bound"]').last().fill('30');

    await screenshot(page, 'diag5-before-commit-with-category');

    // Try committing
    const addBtn1 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn1.scrollIntoViewIfNeeded();
      await addBtn1.click();
      await page.waitForTimeout(2000);
    }

    const toast1 = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-notification-notice');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
    });
    logger.info({ toast1 }, 'TEST 1 commit result');
    await screenshot(page, 'diag5-test1-result');

    // Dismiss notification
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(500);

    // ========== TEST 2: Try "Filler ingredient" — does it need Category? ==========
    logger.info('=== TEST 2: Filler ingredient (no Category) ===');

    // Cancel pending row if test 1 failed
    const hasPendingRow = await page.locator('button').filter({ hasText: /^\+\s*Add$/ }).isVisible({ timeout: 1000 }).catch(() => false);
    if (hasPendingRow) {
      logger.info('Pending row exists — trying to cancel');
      const cancelled = await cancelPendingRow(page);
      logger.info({ cancelled }, 'Cancel result');
      await screenshot(page, 'diag5-after-cancel-attempt');
    }

    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Set type to "Filler ingredient"
    const typeSet2 = await setTypeOfVariable(page, 'Filler ingredient');
    logger.info({ typeSet2 }, 'Type set to Filler ingredient');

    // Type custom name
    const acInput2 = page.locator('.ant-select-auto-complete input').last();
    await acInput2.click();
    await page.waitForTimeout(300);
    await acInput2.fill('');
    await acInput2.pressSequentially('Test Filler', { delay: 50 });
    await page.waitForTimeout(800);
    await acInput2.press('Enter');
    await page.waitForTimeout(400);

    // Set bounds
    await page.locator('input[placeholder="lower bound"]').last().fill('5');
    await page.locator('input[placeholder="upper bound"]').last().fill('10');

    // Try committing (no Category filled)
    const addBtn2 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn2.scrollIntoViewIfNeeded();
      await addBtn2.click();
      await page.waitForTimeout(2000);
    }

    const toast2 = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-notification-notice');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
    });
    logger.info({ toast2 }, 'TEST 2 commit result (Filler without Category)');
    await screenshot(page, 'diag5-test2-result');

    // Dismiss notification
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(500);

    // ========== TEST 3: Check for cancel/delete pending row mechanism ==========
    logger.info('=== TEST 3: Error recovery — find cancel/delete mechanism ===');

    // Check if test 2 row is still pending
    const hasPending3 = await page.locator('button').filter({ hasText: /^\+\s*Add$/ }).isVisible({ timeout: 1000 }).catch(() => false);
    logger.info({ hasPending3 }, 'Pending row after test 2?');

    if (hasPending3) {
      // Catalog ALL clickable elements in the pending row
      const pendingRowElements = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr');
        const pendingRow = Array.from(rows).reverse().find(r => {
          const btns = r.querySelectorAll('button');
          return Array.from(btns).some(b => b.textContent?.trim() === '+ Add');
        });
        if (!pendingRow) return { buttons: [], icons: [], allElements: [] };

        const buttons = Array.from(pendingRow.querySelectorAll('button')).map(b => ({
          text: b.textContent?.trim()?.slice(0, 50) || '',
          classes: b.className?.slice(0, 150) || '',
          disabled: (b as HTMLButtonElement).disabled,
        }));

        const icons = Array.from(pendingRow.querySelectorAll('.anticon, [class*="icon"], svg')).map(i => ({
          classes: (i as HTMLElement).className?.slice(0, 150) || '',
          tag: i.tagName,
          parentClasses: i.parentElement?.className?.slice(0, 100) || '',
          parentTag: i.parentElement?.tagName || '',
        }));

        // Get all td contents for the row
        const cells = Array.from(pendingRow.querySelectorAll('td')).map((td, idx) => ({
          idx,
          text: td.textContent?.trim()?.slice(0, 80) || '',
          innerHTML: td.innerHTML?.slice(0, 200) || '',
        }));

        return { buttons, icons, cells };
      });
      logger.info({ buttons: pendingRowElements.buttons }, 'Pending row buttons');
      logger.info({ icons: pendingRowElements.icons }, 'Pending row icons');
      logger.info({ cells: (pendingRowElements as any).cells }, 'Pending row cells');

      // Try to find and click a delete icon in the pending row
      const deleteIcon = page.locator('tr').filter({ has: page.locator('button', { hasText: /^\+\s*Add$/ }) })
        .last().locator('.anticon-delete, .anticon-close, .anticon-minus-circle, [class*="delete"], [class*="remove"]').first();
      const delVisible = await deleteIcon.isVisible({ timeout: 500 }).catch(() => false);
      logger.info({ delVisible }, 'Delete icon visible in pending row?');

      if (delVisible) {
        await deleteIcon.click();
        await page.waitForTimeout(1000);
        const stillPending = await page.locator('button').filter({ hasText: /^\+\s*Add$/ }).isVisible({ timeout: 500 }).catch(() => false);
        logger.info({ stillPending }, 'After clicking delete icon');
      }

      await screenshot(page, 'diag5-test3-pending-row');
    }

    // ========== TEST 4: Check which project codes map to which projects ==========
    logger.info('=== TEST 4: Project code mapping ===');

    // Navigate back to project list
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Get all project rows with their full text
    const projectRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      return Array.from(rows).map(r => {
        const cells = r.querySelectorAll('td');
        if (cells.length < 2) return null;
        return Array.from(cells).map(c => c.textContent?.trim()?.slice(0, 100) || '');
      }).filter(Boolean);
    });
    logger.info({ projectRows }, 'All project rows (cells)');

    await screenshot(page, 'diag5-project-list');

    // Try clicking each project to see its full name on the Start step
    for (const row of projectRows) {
      if (!row || row.length < 2) continue;
      const code = row[0];
      if (!code || code === '' || code.includes('Variable') || code.includes('Project')) continue;

      logger.info({ code }, `Checking project ${code}...`);
      const projectRow = page.locator('tr').filter({ hasText: code }).first();
      if (await projectRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectRow.click();
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);

        // Check project name
        const projectName = await page.locator('input[placeholder="Project Name"]').inputValue().catch(() => '');
        const pageTitle = await page.evaluate(() => {
          const h1 = document.querySelector('h1, h2, h3, .ant-page-header-heading-title');
          return h1?.textContent?.trim()?.slice(0, 100) || '';
        });
        logger.info({ code, projectName, pageTitle }, 'Project identity');

        // Check which wizard step we're on
        const onIO = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 1500 }).catch(() => false);
        const hasUploadData = await page.locator('.ant-radio-wrapper').filter({ hasText: 'No Data' }).isVisible({ timeout: 1500 }).catch(() => false);
        const hasProjectName = await page.locator('input[placeholder="Project Name"]').isVisible({ timeout: 1500 }).catch(() => false);
        logger.info({ code, onIO, hasUploadData, hasProjectName }, 'Wizard step');

        // Navigate back to project list
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await dismissFloatingButton(page);
        await page.getByText('Projects', { exact: true }).first().click();
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);
      }
    }

    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
