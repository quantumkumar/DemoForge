/**
 * Test on a FRESH project (CBGS) — only types that should work.
 * Goal: Successfully add 4+ variables in sequence.
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

async function addVariable(
  page: Page,
  name: string,
  type: string,
  lower: string,
  upper: string,
  unit: string,
  priority?: string,
): Promise<string> {
  try {
    logger.info({ name, type }, `Adding: ${name}`);

    // Click "+ Add new"
    const addNewBtn = page.getByRole('button', { name: /add new/i });
    if (!await addNewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      return 'NO_ADD_NEW_BUTTON';
    }
    await addNewBtn.click();
    await page.waitForTimeout(1500);

    // Set type FIRST
    const typeSet = await setType(page, type);
    if (!typeSet) return 'TYPE_NOT_SET';

    // Set name (custom — press Enter)
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.click();
    await page.waitForTimeout(300);
    await acInput.fill('');
    await acInput.pressSequentially(name, { delay: 40 });
    await page.waitForTimeout(1000);
    await acInput.press('Enter');
    await page.waitForTimeout(400);

    // Verify name was set
    const nameVal = await acInput.inputValue().catch(() => '');
    logger.info({ nameVal }, 'Name after Enter');

    // Set bounds (if enabled)
    const addingRow = page.locator('.addingRow').last();
    const lb = addingRow.locator('input[placeholder="lower bound"]');
    if (await lb.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await lb.isDisabled().catch(() => true);
      if (!disabled) await lb.fill(lower);
    }
    const ub = addingRow.locator('input[placeholder="upper bound"]');
    if (await ub.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await ub.isDisabled().catch(() => true);
      if (!disabled) await ub.fill(upper);
    }
    await page.waitForTimeout(200);

    // Set unit (if enabled)
    const unitInput = addingRow.locator('input[placeholder="%/grm"]');
    if (await unitInput.isVisible({ timeout: 500 }).catch(() => false)) {
      const disabled = await unitInput.isDisabled().catch(() => true);
      if (!disabled) await unitInput.fill(unit);
    }

    // Set priority (if requested and not Low)
    if (priority && priority !== 'Low') {
      const allSelects = page.locator('.ant-select');
      const count = await allSelects.count();
      for (let i = count - 1; i >= 0; i--) {
        const sel = allSelects.nth(i);
        const text = await sel.textContent().catch(() => '');
        if (text?.includes('Low') || text?.includes('Medium') || text?.includes('High')) {
          const classes = await sel.getAttribute('class').catch(() => '') ?? '';
          if (classes.includes('select-input-type') || classes.includes('auto-complete')) continue;
          if (classes.includes('ant-select-disabled')) continue;
          await sel.locator('.ant-select-selector').click();
          await page.waitForTimeout(500);
          const priOpt = page.locator('.ant-select-item-option').filter({ hasText: priority }).first();
          if (await priOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
            await priOpt.click();
            await page.waitForTimeout(300);
          } else {
            await page.keyboard.press('Escape');
          }
          break;
        }
      }
    }

    // Commit
    const addBtn = addingRow.locator('.add-ingredient');
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      await page.waitForTimeout(2000);
    } else {
      const addBtnFb = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
      if (await addBtnFb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addBtnFb.click();
        await page.waitForTimeout(2000);
      }
    }

    // Read toast
    const toast = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.ant-notification-notice');
      return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 300) || '').join(' | ');
    });

    // Dismiss
    await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
    await page.waitForTimeout(500);

    if (toast.includes('successfully')) {
      logger.info(`✅ SUCCESS: ${name}`);
      return 'SUCCESS';
    }
    logger.warn({ toast }, `❌ FAILED: ${name}`);
    return `ERROR: ${toast.slice(0, 150)}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : String(err);
    logger.error({ error: msg }, `Exception: ${name}`);
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

    // Go to CBGS project (Clean Beauty Gen-Z Shampoo — fresh, on I&O step)
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'CBGS' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasAddNew) {
      logger.error('Not on I&O step');
      return;
    }
    logger.info('On I&O step (CBGS - Clean Beauty Gen-Z Shampoo)');

    const results: Record<string, string> = {};

    // Ingredients as "Processing" type (avoid "Existing ingredient")
    results['SCI'] = await addVariable(page, 'Sodium Cocoyl Isethionate', 'Processing', '5', '12', '%');
    results['DG'] = await addVariable(page, 'Decyl Glucoside', 'Processing', '3', '8', '%');
    results['AloeVera'] = await addVariable(page, 'Aloe Vera Juice', 'Processing', '1', '5', '%');

    // Processing condition as "Processing"
    results['Temp'] = await addVariable(page, 'Temperature', 'Processing', '35', '50', '°C');

    // Outcomes
    results['FoamVol'] = await addVariable(page, 'Foam Volume', 'Analytical outcome', '0', '300', 'mL', 'High');
    results['Sensory'] = await addVariable(page, 'Overall Sensory Score', 'Sensory outcome', '0', '10', '/10', 'High');
    results['NatOrigin'] = await addVariable(page, 'Natural Origin Index', 'Analytical outcome', '0', '100', '%', 'Medium');
    results['COGS'] = await addVariable(page, 'COGS per unit', 'Analytical outcome', '0', '2', '$', 'Medium');

    // Summary
    logger.info('=========== RESULTS SUMMARY ===========');
    const successes = Object.values(results).filter(r => r === 'SUCCESS').length;
    const failures = Object.values(results).filter(r => r !== 'SUCCESS').length;
    for (const [key, result] of Object.entries(results)) {
      logger.info({ test: key, result }, `${result === 'SUCCESS' ? '✅' : '❌'} ${key}`);
    }
    logger.info({ successes, failures, total: Object.keys(results).length }, 'TOTALS');

    await screenshot(page, 'diag11-working-types-final');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
