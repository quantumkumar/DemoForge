/**
 * Diagnostic: Download the CSV template from Upload Data step to understand expected format.
 * Also inspect what happens after we upload our CSV (error messages, status).
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';
import { readFileSync, readdirSync } from 'fs';
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

    // We should be on Upload Data step
    await screenshot(page, 'diag-upload-1-initial');

    // Check if "Download template" link exists
    const templateLink = page.locator('a, span, button').filter({ hasText: /download template/i }).first();
    const templateVisible = await templateLink.isVisible({ timeout: 3000 }).catch(() => false);
    logger.info({ templateVisible }, 'Download template link');

    if (templateVisible) {
      // Download the template file
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await templateLink.click();

      try {
        const download = await downloadPromise;
        const suggestedName = download.suggestedFilename();
        const savePath = join(process.cwd(), '.tmp', suggestedName);
        await download.saveAs(savePath);
        logger.info({ suggestedName, savePath }, 'Template downloaded');

        // Read and log the template content
        const content = readFileSync(savePath, 'utf-8');
        const lines = content.split('\n');
        logger.info({
          lineCount: lines.length,
          headers: lines[0],
          line1: lines[1] || '(empty)',
          line2: lines[2] || '(empty)',
          fullContent: content.slice(0, 2000),
        }, 'Template content');
      } catch (dlErr) {
        logger.warn({ error: String(dlErr) }, 'Download failed — trying alternate approach');
      }
    }

    // Inspect the upload area DOM
    const uploadAreaInfo = await page.evaluate(() => {
      const uploadArea = document.querySelector('.ant-upload-drag, .ant-upload');
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const uploadListItems = document.querySelectorAll('.ant-upload-list-item');

      return {
        hasUploadArea: !!uploadArea,
        uploadAreaClasses: uploadArea?.className?.slice(0, 200) || '',
        fileInputCount: fileInputs.length,
        fileInputAccept: Array.from(fileInputs).map(f => (f as HTMLInputElement).accept),
        uploadListItemCount: uploadListItems.length,
        uploadListItems: Array.from(uploadListItems).map(item => ({
          text: (item as HTMLElement).textContent?.trim()?.slice(0, 100) || '',
          classes: item.className?.slice(0, 150) || '',
          status: item.querySelector('.ant-upload-list-item-done') ? 'done' :
                  item.querySelector('.ant-upload-list-item-error') ? 'error' :
                  item.querySelector('.ant-upload-list-item-uploading') ? 'uploading' : 'unknown',
        })),
        // Check for any error/warning text
        errorMessages: Array.from(document.querySelectorAll('.ant-alert, .ant-message, [class*="error"], [class*="warning"]'))
          .map(el => (el as HTMLElement).textContent?.trim()?.slice(0, 200) || '')
          .filter(t => t.length > 0),
        // Check Next button state
        nextButtonState: (() => {
          const btns = document.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent?.includes('Next')) {
              return {
                disabled: btn.disabled,
                classes: btn.className?.slice(0, 100),
                ariaDisabled: btn.getAttribute('aria-disabled'),
              };
            }
          }
          return null;
        })(),
      };
    });
    logger.info(uploadAreaInfo, 'Upload area DOM inspection');

    // Check what happens with "No Data" - is it actually a radio button?
    const radioState = await page.evaluate(() => {
      const radios = document.querySelectorAll('.ant-radio-wrapper');
      return Array.from(radios).map(r => ({
        text: (r as HTMLElement).textContent?.trim()?.slice(0, 50) || '',
        classes: r.className?.slice(0, 100) || '',
        isDisabled: r.classList.contains('ant-radio-wrapper-disabled'),
        isChecked: r.classList.contains('ant-radio-wrapper-checked'),
        inputDisabled: (r.querySelector('input') as HTMLInputElement)?.disabled ?? null,
      }));
    });
    logger.info({ radios: radioState }, 'Radio button states');

    // Check if there's already uploaded data that we need to remove first
    const existingFiles = await page.evaluate(() => {
      const items = document.querySelectorAll('.ant-upload-list-item');
      return Array.from(items).map(item => {
        const name = item.querySelector('.ant-upload-list-item-name')?.textContent?.trim() || '';
        const deleteBtn = item.querySelector('.ant-upload-list-item-card-actions button, .anticon-delete, .anticon-close');
        return { name, hasDeleteBtn: !!deleteBtn };
      });
    });
    logger.info({ existingFiles }, 'Existing uploaded files');

    // If there are existing files, try to delete them
    if (existingFiles.length > 0) {
      logger.info('Attempting to delete existing uploaded files...');
      for (let i = existingFiles.length - 1; i >= 0; i--) {
        const deleteBtn = page.locator('.ant-upload-list-item').nth(i).locator('.anticon-delete, .anticon-close, button').first();
        if (await deleteBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await deleteBtn.click();
          await page.waitForTimeout(1000);
          logger.info(`Deleted file ${i}`);
        }
      }
      await page.waitForTimeout(2000);
      await screenshot(page, 'diag-upload-2-after-delete');
    }

    // Now check if "No Data" is still disabled after clearing files
    const noDataAfter = await page.evaluate(() => {
      const noData = Array.from(document.querySelectorAll('.ant-radio-wrapper'))
        .find(r => r.textContent?.includes('No Data'));
      return noData ? {
        disabled: noData.classList.contains('ant-radio-wrapper-disabled'),
        checked: noData.classList.contains('ant-radio-wrapper-checked'),
      } : null;
    });
    logger.info({ noDataAfter }, 'No Data state after cleanup');

    // Try clicking "No Data" if now enabled
    if (noDataAfter && !noDataAfter.disabled) {
      const noDataWrapper = page.locator('.ant-radio-wrapper').filter({ hasText: 'No Data' });
      await noDataWrapper.click();
      await page.waitForTimeout(1000);

      // Check Next
      const nextEnabled = await page.getByRole('button', { name: /next/i }).isDisabled().catch(() => true);
      logger.info({ nextEnabled: !nextEnabled }, 'Next after clicking No Data');
    }

    await screenshot(page, 'diag-upload-3-final');
    logger.info('=== DIAGNOSTIC COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
