/**
 * Test a single dataset upload and debug the modal behavior.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
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

  // Write a simple test CSV
  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const csvPath = join(dir, 'test-dataset.csv');
  writeFileSync(csvPath, [
    'Water,Sorbitol,Hydrated Silica,Glycerin,Sodium Fluoride,Viscosity,pH',
    '28,22,18,12,0.24,85000,7.0',
    '30,20,16,14,0.22,78000,6.8',
    '26,24,20,10,0.26,92000,7.2',
  ].join('\n'), 'utf-8');

  const session = await launchBrowser({ headed: true, slowMo: 150 });
  const { page } = session;

  try {
    await login(page, { url, email, password });

    // Navigate to Dataset Library
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);
    await page.getByText('Dataset Library', { exact: false }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    logger.info('On Dataset Library page');

    // Click upload button
    const uploadBtn = page.getByRole('button', { name: /upload new recipe dataset/i });
    await uploadBtn.click();
    await page.waitForTimeout(1500);

    // Fill the modal
    const modal = page.locator('.ant-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('#basic_dataset_name').fill('Test Dataset FS-CC-60');
    await page.locator('#basic_dataset_description').fill('Test formulation dataset');
    await page.locator('#basic_dataset_product_category').fill('Toothpaste');

    // Upload CSV
    const fileInput = page.locator('input[accept=".csv"]');
    await fileInput.setInputFiles(csvPath);
    await page.waitForTimeout(2000);

    // Screenshot before clicking Create
    await screenshot(page, 'dataset-modal-before-create');

    // Check for upload success indicator before Create
    const uploadInfo = await modal.evaluate(el => {
      return {
        innerText: el.textContent?.slice(0, 1000),
        uploadItems: el.querySelectorAll('.ant-upload-list-item').length,
        uploadStatus: el.querySelector('.ant-upload-list-item')?.className,
      };
    });
    logger.info(uploadInfo, 'Modal state before Create');

    // Click Create
    logger.info('Clicking Create...');
    const createBtn = modal.getByRole('button', { name: /create/i });
    await createBtn.click();

    // Monitor modal state for 60 seconds
    for (let i = 1; i <= 12; i++) {
      await page.waitForTimeout(5000);
      const isVisible = await modal.isVisible().catch(() => false);

      if (!isVisible) {
        logger.info({ secondsElapsed: i * 5 }, 'Modal closed!');
        break;
      }

      // Check what's happening in the modal
      const state = await modal.evaluate(el => {
        const btns = Array.from(el.querySelectorAll('button')).map(b => ({
          text: b.textContent?.trim(),
          disabled: b.disabled,
          loading: b.classList.contains('ant-btn-loading'),
        }));
        const errors = Array.from(el.querySelectorAll('.ant-form-item-explain-error')).map(e => e.textContent);
        const spinners = el.querySelectorAll('.ant-spin').length;
        const progress = el.querySelector('.ant-progress')?.textContent;
        return { buttons: btns, errors, spinners, progress };
      });

      logger.info({ secondsElapsed: i * 5, ...state }, 'Modal still open');

      if (i === 4) {
        await screenshot(page, 'dataset-modal-during-create');
      }
    }

    const finalVisible = await modal.isVisible().catch(() => false);
    if (finalVisible) {
      logger.warn('Modal still open after 60s — clicking Cancel');
      await screenshot(page, 'dataset-modal-stuck-final');
      const cancelBtn = modal.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelBtn.click();
      }
    }

    await page.waitForTimeout(2000);
    await screenshot(page, 'dataset-library-after-upload');
    logger.info({ url: page.url() }, 'Final state');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
