/**
 * Download the CSV template from the Dataset Library upload modal
 * to understand the expected format.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import { readFileSync, readdirSync } from 'node:fs';
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

  const session = await launchBrowser({ headed: true, slowMo: 150 });
  const { page, context } = session;

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

    // Fill the modal minimally to enable download
    const modal = page.locator('.ant-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // Screenshot the modal
    await screenshot(page, 'template-modal');

    // Look for "Download template" link/button
    const downloadLink = modal.getByText('Download template', { exact: false });
    const isVisible = await downloadLink.isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ visible: isVisible }, 'Download template link');

    if (isVisible) {
      // Set up download listener before clicking
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        downloadLink.click(),
      ]);

      // Save to tmp
      const savePath = join(process.cwd(), 'tmp', 'turing-template.csv');
      await download.saveAs(savePath);
      logger.info({ path: savePath }, 'Template downloaded');

      // Read and log
      const content = readFileSync(savePath, 'utf-8');
      console.log('\n=== TEMPLATE CSV CONTENT ===');
      console.log(content);
      console.log('=== END TEMPLATE ===\n');

      // Parse first few lines
      const lines = content.split('\n').filter(l => l.trim());
      logger.info({ lineCount: lines.length, headers: lines[0] }, 'Template structure');
      if (lines.length > 1) {
        logger.info({ row1: lines[1] }, 'First data row');
      }
      if (lines.length > 2) {
        logger.info({ row2: lines[2] }, 'Second data row');
      }
    } else {
      // Maybe it's an anchor tag
      const anchors = await modal.locator('a').all();
      for (const a of anchors) {
        const text = await a.textContent().catch(() => '');
        const href = await a.getAttribute('href').catch(() => '');
        logger.info({ text, href }, 'Found anchor in modal');
      }

      // Also look at any text that says "template"
      const allText = await modal.textContent();
      logger.info({ modalText: allText?.slice(0, 500) }, 'Modal full text');
    }

    // Close modal
    const cancelBtn = modal.getByRole('button', { name: /cancel/i });
    await cancelBtn.click();

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
