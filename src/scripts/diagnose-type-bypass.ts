/**
 * Test which variable types work WITHOUT the Functional Role error.
 * Try: Filler ingredient, Processing, Existing ingredient (custom name), etc.
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

async function setType(page: Page, typeName: string): Promise<boolean> {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const typeSelect = page.locator('.select-input-type').last();
  await typeSelect.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await typeSelect.locator('.ant-select-selector').click();
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

async function tryAddVariable(
  page: Page,
  opts: { name: string; type: string; useLibrary: boolean; lower: string; upper: string }
): Promise<string> {
  try {
    logger.info({ ...opts }, `Testing: ${opts.name} (${opts.type})`);

    // Click "+ Add new"
    const addNewBtn = page.getByRole('button', { name: /add new/i });
    if (!await addNewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      return 'NO_ADD_NEW_BUTTON';
    }
    await addNewBtn.click();
    await page.waitForTimeout(1500);

    // Set type FIRST
    const typeSet = await setType(page, opts.type);
    if (!typeSet) return 'TYPE_NOT_SET';

    // Set name
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.click();
    await page.waitForTimeout(300);
    await acInput.fill('');
    await acInput.pressSequentially(opts.name, { delay: 50 });
    await page.waitForTimeout(1200);

    if (opts.useLibrary) {
      const option = page.locator('.ant-select-item-option').filter({ hasText: opts.name }).first();
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(600);
        logger.info('Selected from library');
      } else {
        await acInput.press('Enter');
        await page.waitForTimeout(400);
        logger.info('No library match — used Enter');
      }
    } else {
      await acInput.press('Enter');
      await page.waitForTimeout(400);
      logger.info('Custom name via Enter');
    }

    // Set bounds — check if enabled first
    const addingRow = page.locator('.addingRow').last();
    const lb = addingRow.locator('input[placeholder="lower bound"]');
    if (await lb.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await lb.isDisabled().catch(() => true);
      if (!disabled) {
        await lb.fill(opts.lower);
      } else {
        logger.info('Lower bound is DISABLED for this type');
      }
    }
    const ub = addingRow.locator('input[placeholder="upper bound"]');
    if (await ub.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await ub.isDisabled().catch(() => true);
      if (!disabled) {
        await ub.fill(opts.upper);
      } else {
        logger.info('Upper bound is DISABLED for this type');
      }
    }
    await page.waitForTimeout(200);

    // Set unit (if enabled)
    const unitInput = addingRow.locator('input[placeholder="%/grm"]');
    if (await unitInput.isVisible({ timeout: 500 }).catch(() => false)) {
      const disabled = await unitInput.isDisabled().catch(() => true);
      if (!disabled) {
        await unitInput.fill('%');
      }
    }

    // Commit
    const addBtn = addingRow.locator('.add-ingredient');
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      await page.waitForTimeout(2000);
    } else {
      const addBtnFallback = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
      if (await addBtnFallback.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addBtnFallback.click();
        await page.waitForTimeout(2000);
      }
    }

    // Read toast
    const toast = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-notification-notice');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
    });
    logger.info({ toast }, `Result for ${opts.name}`);

    // Dismiss
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(500);

    if (toast.includes('successfully')) return 'SUCCESS';
    if (toast.includes('Functional Role')) return 'FUNCTIONAL_ROLE_ERROR';
    if (toast.includes('Type of variable')) return 'TYPE_REQUIRED_ERROR';
    if (toast.includes('Error')) return `ERROR: ${toast.slice(0, 150)}`;
    return `UNKNOWN: ${toast.slice(0, 100)}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : String(err);
    logger.error({ error: msg }, `Exception for ${opts.name}`);
    return `EXCEPTION: ${msg}`;
  }
}

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  const session = await launchBrowser({ headed: true, slowMo: 80 });
  const { page } = session;

  try {
    await login(page, { url, email, password });
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);

    // Go to GPT project
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'GPT' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasAddNew) {
      logger.error('Not on I&O step');
      return;
    }
    logger.info('On I&O step (GPT project)');

    const results: Record<string, string> = {};

    // Test 1: "Existing ingredient" + custom name (NOT from library)
    results['existing_custom'] = await tryAddVariable(page, {
      name: 'Hydroxyapatite',
      type: 'Existing ingredient',
      useLibrary: false,
      lower: '3',
      upper: '10',
    });

    // Test 2: "Existing ingredient" + library ingredient
    results['existing_library'] = await tryAddVariable(page, {
      name: 'Glycerin',
      type: 'Existing ingredient',
      useLibrary: true,
      lower: '18',
      upper: '30',
    });

    // Test 3: "Filler ingredient" + custom name (bounds disabled)
    results['filler_custom'] = await tryAddVariable(page, {
      name: 'Xanthan Gum',
      type: 'Filler ingredient',
      useLibrary: false,
      lower: '0.3',
      upper: '1.2',
    });

    // Test 4: "Processing" + custom name (ingredient disguised as processing)
    results['processing_ingredient'] = await tryAddVariable(page, {
      name: 'Activated Charcoal',
      type: 'Processing',
      useLibrary: false,
      lower: '0',
      upper: '3',
    });

    // Test 5: "Processing" + processing condition
    results['processing_condition'] = await tryAddVariable(page, {
      name: 'Mixing Speed',
      type: 'Processing',
      useLibrary: false,
      lower: '400',
      upper: '800',
    });

    // Test 6: "Analytical outcome" + custom name
    results['analytical'] = await tryAddVariable(page, {
      name: 'Viscosity',
      type: 'Analytical outcome',
      useLibrary: false,
      lower: '60000',
      upper: '90000',
    });

    // Test 7: "Sensory outcome" + custom name
    results['sensory'] = await tryAddVariable(page, {
      name: 'Overall Sensory Score',
      type: 'Sensory outcome',
      useLibrary: false,
      lower: '0',
      upper: '10',
    });

    // Test 8: "Consumer outcome" + custom name
    results['consumer'] = await tryAddVariable(page, {
      name: 'Purchase Intent',
      type: 'Consumer outcome',
      useLibrary: false,
      lower: '0',
      upper: '100',
    });

    // Summary
    logger.info('=========== RESULTS SUMMARY ===========');
    for (const [key, result] of Object.entries(results)) {
      const icon = result === 'SUCCESS' ? '✅' : '❌';
      logger.info({ test: key, result }, `${icon} ${key}: ${result}`);
    }

    await screenshot(page, 'diag10-type-bypass-final');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
