/**
 * Explore the Create Product wizard steps 2-5 by creating a test product.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';

async function extractPageElements(page: Page, label: string) {
  await screenshot(page, label);

  const elements = await page.evaluate(() => {
    const results: Record<string, unknown[]> = { buttons: [], inputs: [], selects: [], radios: [], textareas: [] };

    document.querySelectorAll('button, [role="button"]').forEach(el => {
      const text = (el as HTMLElement).innerText?.trim().slice(0, 80);
      if (text) results.buttons.push(text);
    });

    document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])').forEach(el => {
      results.inputs.push({
        name: el.getAttribute('name'),
        id: el.id,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
      });
    });

    document.querySelectorAll('input[type="radio"]').forEach(el => {
      results.radios.push({
        name: el.getAttribute('name'),
        value: el.getAttribute('value'),
        label: el.closest('label')?.textContent?.trim().slice(0, 80) || el.parentElement?.textContent?.trim().slice(0, 80),
        checked: (el as HTMLInputElement).checked,
      });
    });

    document.querySelectorAll('textarea').forEach(el => {
      results.textareas.push({
        name: el.getAttribute('name'),
        id: el.id,
        placeholder: el.getAttribute('placeholder')?.slice(0, 80),
      });
    });

    document.querySelectorAll('.ant-select').forEach(el => {
      const ph = el.querySelector('.ant-select-selection-placeholder')?.textContent;
      const val = el.querySelector('.ant-select-selection-item')?.textContent;
      results.selects.push({ placeholder: ph, value: val });
    });

    return results;
  });

  logger.info({ label, ...elements }, `Elements: ${label}`);
  return elements;
}

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  const session = await launchBrowser({ headed: true, slowMo: 150 });
  const { page } = session;

  try {
    await login(page, { url, email, password });

    // Go to Products
    await page.waitForTimeout(2000);
    await page.getByText('Products', { exact: true }).first().click();
    await page.waitForTimeout(3000);

    // Dismiss floating button
    await page.evaluate(() => {
      const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
      if (floater) floater.style.display = 'none';
    });

    // Click "Create Product"
    await page.getByRole('button', { name: /create product/i }).click();
    await page.waitForTimeout(2000);

    // Step 1: Product Information
    logger.info('=== Step 1: Product Information ===');
    await extractPageElements(page, 'wizard-step1');

    // Fill Step 1
    await page.locator('#category').fill('Toothpaste');
    await page.locator('#description').fill('Premium toothpaste formulations for oral care — cavity protection, whitening, and sensitivity relief.');

    // Select "Upload your own data" radio
    const uploadRadio = page.locator('input[type="radio"]').first();
    await uploadRadio.click();
    await page.waitForTimeout(1000);
    await extractPageElements(page, 'wizard-step1-upload-selected');

    // Switch back to "No Data" for now
    const noDataRadio = page.getByText('No Data', { exact: true });
    await noDataRadio.click();
    await page.waitForTimeout(500);

    // Click Next
    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForTimeout(3000);

    // Step 2
    logger.info('=== Step 2 ===');
    await extractPageElements(page, 'wizard-step2');

    // Try to click Next again for Step 3
    const nextBtn = page.getByRole('button', { name: /next/i });
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(3000);
      logger.info('=== Step 3 ===');
      await extractPageElements(page, 'wizard-step3');

      // Step 4
      if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(3000);
        logger.info('=== Step 4 ===');
        await extractPageElements(page, 'wizard-step4');

        // Step 5
        if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(3000);
          logger.info('=== Step 5 ===');
          await extractPageElements(page, 'wizard-step5');
        }
      }
    }

    // Check current page state
    logger.info({ url: page.url() }, 'Final URL');

    // Go back
    const backBtn = page.getByRole('button', { name: /back/i }).first();
    if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await backBtn.click();
    }

    logger.info('Wizard exploration complete');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
