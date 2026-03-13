/**
 * Diagnostic v3: Intercept ALL network requests during template download click,
 * and try uploading a CSV that matches the expected format (via response interception).
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
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

    // ===== Intercept ALL network traffic =====
    const networkRequests: { url: string; method: string; status?: number; contentType?: string; bodyPreview?: string }[] = [];

    page.on('request', (req) => {
      networkRequests.push({
        url: req.url().slice(0, 200),
        method: req.method(),
      });
    });

    page.on('response', async (resp) => {
      const reqUrl = resp.url();
      const entry = networkRequests.find(r => r.url === reqUrl.slice(0, 200));
      if (entry) {
        entry.status = resp.status();
        entry.contentType = resp.headers()['content-type'] || '';
        // Capture body for CSV/download responses
        if (entry.contentType.includes('csv') || entry.contentType.includes('octet') ||
            reqUrl.includes('template') || reqUrl.includes('download') || reqUrl.includes('csv')) {
          try {
            const body = await resp.text();
            entry.bodyPreview = body.slice(0, 500);
          } catch {}
        }
      }
    });

    // Clear request list
    networkRequests.length = 0;

    // Click the actual <a> "Download template" link
    const downloadLink = page.locator('a').filter({ hasText: /download template/i }).first();
    const linkVisible = await downloadLink.isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ linkVisible }, 'Download <a> link');

    if (linkVisible) {
      // Use Promise.all to catch both download and new page events
      const contextPromise = page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

      await downloadLink.click();
      await page.waitForTimeout(5000);

      const newPage = await contextPromise;
      const download = await downloadPromise;

      if (download) {
        const suggestedName = download.suggestedFilename();
        const savePath = join(process.cwd(), '.tmp', suggestedName);
        await download.saveAs(savePath);
        const content = readFileSync(savePath, 'utf-8');
        logger.info({ suggestedName, content: content.slice(0, 1000) }, 'Downloaded template');
      }

      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});
        const newUrl = newPage.url();
        const body = await newPage.content();
        logger.info({ newUrl, bodyPreview: body.slice(0, 500) }, 'New page opened');
        await newPage.close();
      }

      // Log all network requests since click
      const relevant = networkRequests.filter(r =>
        r.url.includes('template') || r.url.includes('download') || r.url.includes('csv') ||
        r.contentType?.includes('csv') || r.contentType?.includes('octet')
      );
      logger.info({ relevant, totalRequests: networkRequests.length }, 'Relevant network requests');

      // Also log ALL requests for debugging
      for (const req of networkRequests) {
        if (req.status && req.status !== 200) continue; // Skip non-200
        if (req.url.includes('chunk') || req.url.includes('webpack') || req.url.includes('.js')) continue;
        logger.info({ url: req.url, method: req.method, status: req.status, ct: req.contentType }, 'Network req');
      }
    }

    // ===== Try alternative: Use blob URL interception =====
    logger.info('=== Trying blob URL interception ===');

    // The download might use blob: URLs or data: URLs via JavaScript
    const blobUrl = await page.evaluate(() => {
      // Check if there's a blob URL in any anchor
      const links = document.querySelectorAll('a[href^="blob:"], a[href^="data:"]');
      return Array.from(links).map(l => ({
        href: (l as HTMLAnchorElement).href?.slice(0, 300) || '',
        text: (l as HTMLElement).textContent?.trim() || '',
      }));
    });
    logger.info({ blobUrl }, 'Blob URLs found');

    // ===== Try: upload a CSV and check what error messages appear =====
    logger.info('=== Uploading test CSV to check validation ===');

    // Generate a simple test CSV
    const tmpDir = join(process.cwd(), '.tmp');
    mkdirSync(tmpDir, { recursive: true });
    const testCsvPath = join(tmpDir, 'test_sds.csv');
    writeFileSync(testCsvPath, 'Column A,Column B,Column C\n1,2,3\n4,5,6\n', 'utf-8');

    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(testCsvPath);
      await page.waitForTimeout(5000);

      // Check for error messages, toasts, alerts
      const uploadResult = await page.evaluate(() => {
        // Toasts
        const toasts = document.querySelectorAll('.ant-notification-notice, .ant-message-notice');
        const toastTexts = Array.from(toasts).map(t => (t as HTMLElement).textContent?.trim()?.slice(0, 200) || '');

        // Upload list items
        const items = document.querySelectorAll('.ant-upload-list-item');
        const itemData = Array.from(items).map(item => ({
          text: (item as HTMLElement).textContent?.trim()?.slice(0, 100) || '',
          classes: item.className?.slice(0, 150) || '',
          isError: item.classList.contains('ant-upload-list-item-error'),
          isDone: item.classList.contains('ant-upload-list-item-done'),
          isUploading: item.classList.contains('ant-upload-list-item-uploading'),
        }));

        // Any error text on page
        const errorEls = document.querySelectorAll('.ant-alert-error, .ant-form-item-explain-error, [class*="error"]');
        const errors = Array.from(errorEls).map(e => (e as HTMLElement).textContent?.trim()?.slice(0, 200) || '').filter(t => t.length > 0);

        // Check Next button
        const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));

        return {
          toasts: toastTexts,
          uploadItems: itemData,
          errors,
          nextEnabled: nextBtn ? !nextBtn.disabled : null,
        };
      });
      logger.info(uploadResult, 'Upload result');

      await screenshot(page, 'diag-upload-v3-after-upload');

      // Dismiss toasts
      await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // ===== Try: remove uploaded file and try "No Data" again =====
    logger.info('=== Removing uploaded files and trying No Data ===');

    // Delete all uploaded files
    const deleteButtons = page.locator('.ant-upload-list-item .anticon-delete, .ant-upload-list-item .anticon-close');
    const deleteCount = await deleteButtons.count();
    logger.info({ deleteCount }, 'Delete buttons found');
    for (let i = deleteCount - 1; i >= 0; i--) {
      await deleteButtons.nth(i).click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2000);

    // Check No Data status again
    const noDataNow = await page.evaluate(() => {
      const noData = Array.from(document.querySelectorAll('.ant-radio-wrapper'))
        .find(r => r.textContent?.includes('No Data'));
      return noData ? {
        disabled: noData.classList.contains('ant-radio-wrapper-disabled'),
        checked: noData.classList.contains('ant-radio-wrapper-checked'),
      } : null;
    });
    logger.info({ noDataNow }, 'No Data after delete');

    await screenshot(page, 'diag-upload-v3-final');
    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
