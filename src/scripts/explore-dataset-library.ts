/**
 * Explore the Dataset Library UI to discover form fields and upload flow.
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

async function extractPageElements(page: Page, label: string) {
  await screenshot(page, label);

  const elements = await page.evaluate(() => {
    const results: Record<string, unknown[]> = {
      buttons: [], inputs: [], selects: [], radios: [], textareas: [],
      links: [], tables: [], fileInputs: [], tabs: [],
    };

    document.querySelectorAll('button, [role="button"]').forEach(el => {
      const text = (el as HTMLElement).innerText?.trim().slice(0, 80);
      if (text) results.buttons.push(text);
    });

    document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="file"])').forEach(el => {
      results.inputs.push({
        name: el.getAttribute('name'),
        id: el.id,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
      });
    });

    document.querySelectorAll('input[type="file"]').forEach(el => {
      results.fileInputs.push({
        id: el.id,
        accept: el.getAttribute('accept'),
        multiple: el.hasAttribute('multiple'),
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

    document.querySelectorAll('a').forEach(el => {
      const text = el.textContent?.trim().slice(0, 60);
      const href = el.getAttribute('href');
      if (text && href) results.links.push({ text, href });
    });

    document.querySelectorAll('.ant-tabs-tab').forEach(el => {
      results.tabs.push(el.textContent?.trim().slice(0, 60));
    });

    document.querySelectorAll('table').forEach(el => {
      const headers: string[] = [];
      el.querySelectorAll('th').forEach(th => {
        headers.push(th.textContent?.trim().slice(0, 40) ?? '');
      });
      const rowCount = el.querySelectorAll('tbody tr').length;
      results.tables.push({ headers, rowCount });
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

    // Go to Dataset Library
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);

    // Look for "Dataset Library" on dashboard
    const datasetCard = page.getByText('Dataset Library', { exact: false }).first();
    await datasetCard.waitFor({ state: 'visible', timeout: 10_000 });
    await datasetCard.click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    logger.info('=== Dataset Library Main Page ===');
    await extractPageElements(page, 'dataset-library-main');

    // Look for "Create" or "Upload" or "Add" button
    const createBtn = page.getByRole('button', { name: /create|upload|add|import|new/i }).first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const btnText = await createBtn.textContent().catch(() => 'unknown');
      logger.info({ button: btnText }, 'Found create/upload button');
      await createBtn.click();
      await page.waitForTimeout(2000);
      await dismissFloatingButton(page);

      logger.info('=== Dataset Creation Form / Dialog ===');
      await extractPageElements(page, 'dataset-create-form');

      // Check for modal/dialog
      const modal = page.locator('.ant-modal, [role="dialog"]').first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        logger.info('Modal dialog detected');
        const modalContent = await modal.evaluate(el => el.innerHTML.slice(0, 2000));
        logger.info({ modalContent: modalContent.slice(0, 500) }, 'Modal content snippet');
      }

      // Try to find file upload area
      const uploadArea = page.locator('.ant-upload, [class*="upload"], [class*="dropzone"]').first();
      if (await uploadArea.isVisible({ timeout: 2000 }).catch(() => false)) {
        logger.info('Upload area found');
        await screenshot(page, 'dataset-upload-area');
      }

      // Look for tabs (might have CSV upload vs manual entry)
      const tabs = page.locator('.ant-tabs-tab');
      const tabCount = await tabs.count();
      if (tabCount > 0) {
        for (let i = 0; i < tabCount; i++) {
          const tabText = await tabs.nth(i).textContent();
          logger.info({ tab: tabText, index: i }, 'Tab found');
        }
      }

      // Cancel/close back
      const cancelBtn = page.getByRole('button', { name: /cancel|close|back/i }).first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(1000);
      }
    } else {
      logger.warn('No create/upload button found on Dataset Library page');

      // Try looking for any clickable elements
      const allButtons = await page.locator('button, [role="button"]').allTextContents();
      logger.info({ buttons: allButtons.filter(b => b.trim()) }, 'All buttons on page');
    }

    // Also check the URL to understand routing
    logger.info({ url: page.url() }, 'Final URL');

    logger.info('Dataset Library exploration complete');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
