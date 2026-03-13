/**
 * Scan all projects to find one that reaches I&O step,
 * then test Type dropdown + commit flow on it.
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

async function tryReachIO(page: Page): Promise<boolean> {
  // Check if already on I&O
  if (await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 2000 }).catch(() => false)) return true;

  // Step 1: Start
  if (await page.locator('input[placeholder="Project Name"]').isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByRole('button', { name: /next/i }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);
  }

  // Check if on I&O now
  if (await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 2000 }).catch(() => false)) return true;

  // Step 2: Upload Data — try No Data
  const noDataWrapper = page.locator('.ant-radio-wrapper').filter({ hasText: 'No Data' });
  if (await noDataWrapper.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isDisabled = await noDataWrapper.evaluate(el => el.classList.contains('ant-radio-wrapper-disabled')).catch(() => false);
    if (!isDisabled) {
      await noDataWrapper.click();
      await page.waitForTimeout(1000);
      const nextBtn = page.getByRole('button', { name: /next/i });
      const disabled = await nextBtn.isDisabled().catch(() => true);
      if (!disabled) {
        await nextBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);
      }
    } else {
      return false; // No Data is disabled — can't proceed without CSV upload
    }
  }

  return page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
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

    // Go to Projects list
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Get all project names from the table
    const projectNames = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const names: string[] = [];
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          const name = cells[0]?.textContent?.trim() || '';
          if (name && name !== 'Variable Name') names.push(name);
        }
      }
      return names;
    });
    logger.info({ projectNames }, 'All projects found');

    // Try each project
    let targetProject: string | null = null;
    for (const name of projectNames) {
      logger.info({ name }, 'Trying project...');

      // Navigate back to projects list
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      await dismissFloatingButton(page);
      await page.getByText('Projects', { exact: true }).first().click();
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);

      // Click project
      const row = page.locator('tr').filter({ hasText: name }).first();
      if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
        await row.click();
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);

        const reachedIO = await tryReachIO(page);
        logger.info({ name, reachedIO }, 'Project I&O reachability');

        if (reachedIO) {
          targetProject = name;
          break;
        }
      }
    }

    if (!targetProject) {
      logger.error('No project can reach I&O step! All may need CSV upload.');
      return;
    }

    logger.info({ targetProject }, 'Using this project for Type + Commit test');
    await screenshot(page, 'diag3-on-io-step');

    // ========== TEST A: Library ingredient + commit ==========
    logger.info('=== TEST A: Library ingredient ===');

    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Type library ingredient
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.fill('');
    await acInput.pressSequentially('Glycerin', { delay: 60 });
    await page.waitForTimeout(1500);

    const glycOption = page.locator('.ant-select-item-option').filter({ hasText: 'Glycerin' }).first();
    if (await glycOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await glycOption.click();
      await page.waitForTimeout(800);
      logger.info('Selected Glycerin from library');
    }

    // Check Type auto-fill
    const typeAfterLib = await page.locator('.select-input-type').last().textContent().catch(() => '');
    logger.info({ typeAfterLib }, 'Type after library selection');

    // Set bounds
    await page.locator('input[placeholder="lower bound"]').last().fill('18');
    await page.locator('input[placeholder="upper bound"]').last().fill('30');

    await screenshot(page, 'diag3-row-A-filled');

    // Commit
    const addBtn = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      await page.waitForTimeout(2000);
      logger.info('Committed row A');
    }

    await screenshot(page, 'diag3-after-commit-A');

    // Check for error toasts
    const toastsA = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-message-notice, .Toastify__toast, [class*="ant-message"]');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 200) || '');
    });
    logger.info({ toastsA }, 'Toast messages after A');

    const remainA = await page.locator('button').filter({ hasText: /^\+\s*Add$/ }).count();
    logger.info({ remainingAddBtns: remainA }, 'After commit A (0 = success)');

    // ========== TEST B: Custom outcome ==========
    logger.info('=== TEST B: Custom outcome ===');

    await page.getByRole('button', { name: /add new/i }).click();
    await page.waitForTimeout(1500);

    // Blur and dismiss
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Set Type first
    const typeSelect = page.locator('.select-input-type').last();
    const typeSelector = typeSelect.locator('.ant-select-selector');
    await typeSelector.click();
    await page.waitForTimeout(1200);

    const opts = await page.locator('.ant-select-item-option').allTextContents();
    logger.info({ opts: opts.slice(0, 10) }, 'Type dropdown options');
    await screenshot(page, 'diag3-type-dropdown-B');

    if (opts.some(t => t.includes('Analytical'))) {
      await page.locator('.ant-select-item-option').filter({ hasText: 'Analytical outcome' }).first().click();
      await page.waitForTimeout(500);
      logger.info('Selected Analytical outcome');
    }

    const typeTextB = await typeSelect.textContent().catch(() => '');
    logger.info({ typeTextB }, 'Type after selection');

    // Type custom name
    const acInput2 = page.locator('.ant-select-auto-complete input').last();
    await acInput2.click();
    await page.waitForTimeout(300);
    await acInput2.fill('');
    await acInput2.pressSequentially('COGS per unit', { delay: 60 });
    await page.waitForTimeout(1200);
    await acInput2.press('Enter');
    await page.waitForTimeout(500);
    const nameB = await acInput2.inputValue().catch(() => '');
    logger.info({ nameB }, 'Custom name after Enter');

    // Bounds
    await page.locator('input[placeholder="lower bound"]').last().fill('0');
    await page.locator('input[placeholder="upper bound"]').last().fill('3');

    await screenshot(page, 'diag3-row-B-filled');

    // Commit
    const addBtn2 = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
    if (await addBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn2.click();
      await page.waitForTimeout(2000);
      logger.info('Committed row B');
    }

    await screenshot(page, 'diag3-after-commit-B');

    const toastsB = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-message-notice, .Toastify__toast, [class*="ant-message"]');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 200) || '');
    });
    logger.info({ toastsB }, 'Toast messages after B');

    const remainB = await page.locator('button').filter({ hasText: /^\+\s*Add$/ }).count();
    logger.info({ remainingAddBtns: remainB }, 'After commit B (0 = success)');

    await screenshot(page, 'diag3-final');
    logger.info('=== COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
