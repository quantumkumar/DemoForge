/**
 * Test: Upload a properly-formatted CSV to SDS project to get past the Upload Data step.
 * Uses the discovered template format: FormulationID, Type, <variable columns>
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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

  const session = await launchBrowser({ headed: true, slowMo: 80 });
  const { page } = session;

  try {
    await login(page, { url, email, password });
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);

    // Go to SDS project
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    await page.locator('tr').filter({ hasText: 'SDS' }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Generate CSV with correct format
    const tmpDir = join(process.cwd(), '.tmp');
    mkdirSync(tmpDir, { recursive: true });

    // Match the template format: FormulationID,Type,<variables>
    const headers = [
      'FormulationID', 'Type',
      'Sodium Cocoyl Isethionate', 'Decyl Glucoside', 'Cocamidopropyl Betaine',
      'Carbomer', 'Guar HPC', 'Mixing Speed', 'Temperature',
      'Foam Volume', 'Viscosity', 'COGS per unit', 'Wet Combing Force Reduction',
      'Flash Lather Score', 'Shelf Stability'
    ];

    const rows = [
      ['T01', 'Past formulation', '8.2', '4.5', '5.1', '0.25', '0.3', '350', '42', '215', '6800', '0.41', '28', '7.5', '18'],
      ['T02', 'Past formulation', '10.5', '3.2', '6.0', '0.18', '0.4', '280', '45', '230', '7200', '0.39', '32', '8.0', '20'],
      ['T03', 'Past formulation', '7.0', '5.8', '4.0', '0.35', '0.2', '420', '38', '195', '6500', '0.44', '25', '7.0', '16'],
      ['T04', 'Past formulation', '12.0', '2.5', '7.0', '0.15', '0.35', '300', '50', '250', '7500', '0.36', '35', '8.5', '22'],
      ['T05', 'Past formulation', '6.5', '6.0', '3.5', '0.40', '0.15', '450', '40', '185', '6200', '0.46', '22', '6.5', '15'],
      ['T06', 'Past formulation', '9.0', '4.0', '5.5', '0.22', '0.28', '320', '48', '220', '7100', '0.40', '30', '7.8', '19'],
      ['T07', 'Benchmark', '11.0', '3.8', '6.5', '0.20', '0.32', '380', '44', '240', '7400', '0.38', '33', '8.2', '21'],
      ['T08', 'Competitive', '9.5', '5.0', '5.0', '0.28', '0.25', '400', '43', '225', '6900', '0.42', '29', '7.6', '17'],
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\r\n');

    const csvPath = join(tmpDir, 'sds_formulations.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    logger.info({ path: csvPath, headerCount: headers.length }, 'CSV generated');

    // Ensure "Upload your own data" is selected
    const uploadRadio = page.locator('.ant-radio-wrapper').filter({ hasText: /upload your own data/i });
    if (await uploadRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadRadio.click();
      await page.waitForTimeout(500);
    }

    // Monitor network requests
    const apiRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('api')) {
        apiRequests.push(`${req.method()} ${req.url().slice(0, 150)}`);
      }
    });

    // Upload the CSV
    const fileInput = page.locator('input[type="file"]');
    await fileInput.first().setInputFiles(csvPath);
    logger.info('CSV file set');

    // Wait for processing
    await page.waitForTimeout(5000);

    // Check upload status
    const uploadResult = await page.evaluate(() => {
      const items = document.querySelectorAll('.ant-upload-list-item');
      const itemData = Array.from(items).map(item => ({
        text: (item as HTMLElement).textContent?.trim()?.slice(0, 100) || '',
        classes: item.className?.slice(0, 200) || '',
      }));

      // Check for any toast/notification
      const toasts = document.querySelectorAll('.ant-notification-notice, .ant-message-notice');
      const toastTexts = Array.from(toasts).map(t => (t as HTMLElement).textContent?.trim()?.slice(0, 200) || '');

      // Check for modal or table that might show parsed data
      const tables = document.querySelectorAll('table, .ant-table');
      const modals = document.querySelectorAll('.ant-modal');

      // Check Next button
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));

      // Check Save button
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save'));

      return {
        uploadItems: itemData,
        toasts: toastTexts,
        tableCount: tables.length,
        modalCount: modals.length,
        nextDisabled: nextBtn?.disabled ?? true,
        saveDisabled: saveBtn?.disabled ?? true,
      };
    });
    logger.info(uploadResult, 'Upload result');
    logger.info({ apiRequests }, 'API requests during upload');

    await screenshot(page, 'test-csv-1-after-upload');

    // Wait more and check again
    await page.waitForTimeout(5000);

    const nextBtn = page.getByRole('button', { name: /next/i });
    const nextDisabled = await nextBtn.isDisabled().catch(() => true);
    logger.info({ nextDisabled }, 'Next button after 10s');

    // Try clicking Save
    const saveBtn = page.getByRole('button', { name: /save/i });
    const saveVisible = await saveBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const saveDisabled = await saveBtn.isDisabled().catch(() => true);
    logger.info({ saveVisible, saveDisabled }, 'Save button state');

    if (saveVisible && !saveDisabled) {
      logger.info('Clicking Save...');
      await saveBtn.click();
      await page.waitForTimeout(5000);

      // Check for toasts after save
      const saveToast = await page.evaluate(() => {
        const nodes = document.querySelectorAll('.ant-notification-notice');
        return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 200) || '').join(' | ');
      });
      logger.info({ saveToast }, 'Save result');

      // Check Next again
      const nextDisabledAfterSave = await nextBtn.isDisabled().catch(() => true);
      logger.info({ nextDisabledAfterSave }, 'Next after Save');

      await screenshot(page, 'test-csv-2-after-save');
    }

    // Try clicking Next even if it looks disabled (some UI frameworks disable visually but still allow click)
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isActuallyDisabled = await nextBtn.isDisabled().catch(() => true);
      if (!isActuallyDisabled) {
        logger.info('Clicking Next...');
        await nextBtn.click({ timeout: 10000 });
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);

        // Check if we made it to I&O
        const hasAddNew = await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false);
        logger.info({ hasAddNew }, 'After Next click');
        await screenshot(page, 'test-csv-3-after-next');
      }
    }

    logger.info('=== TEST COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
