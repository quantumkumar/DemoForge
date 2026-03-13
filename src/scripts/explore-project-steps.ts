/**
 * Navigate through all wizard steps of an existing project to discover forms.
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

    // Go to Projects
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Click the first project
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // ========= Step 2: Upload Data =========
    const uploadDataLink = page.getByText('Upload Data', { exact: true });
    if (await uploadDataLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadDataLink.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'step2-upload-data');

      const step2Inputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, select, textarea, [role="button"]');
        return Array.from(inputs).map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          placeholder: (el as HTMLInputElement).placeholder,
          id: el.id,
          text: el.textContent?.trim().slice(0, 80),
        }));
      });
      logger.info({ step2Inputs: step2Inputs.slice(0, 20) }, 'Step 2 form elements');

      const step2Buttons = await page.locator('button').allTextContents();
      logger.info({ buttons: step2Buttons.filter(b => b.trim()) }, 'Step 2 buttons');
    }

    // ========= Step 3: Inputs & Outcomes =========
    const inputsLink = page.getByText('Inputs & Outcomes', { exact: true });
    if (await inputsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inputsLink.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'step3-inputs-outcomes');

      logger.info({ url: page.url() }, 'Step 3 URL');

      const step3Text = await page.locator('main, [class*="content"], [class*="Content"]').first().textContent().catch(() => '');
      logger.info({ text: step3Text?.slice(0, 500) }, 'Step 3 page text');

      const step3Inputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, select, textarea');
        return Array.from(inputs).map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          placeholder: (el as HTMLInputElement).placeholder,
          id: el.id,
          label: el.closest('.ant-form-item')?.querySelector('label')?.textContent || '',
        }));
      });
      logger.info({ step3Inputs: step3Inputs.slice(0, 20) }, 'Step 3 form elements');

      const step3Buttons = await page.locator('button').allTextContents();
      logger.info({ buttons: step3Buttons.filter(b => b.trim()) }, 'Step 3 buttons');

      // Check for tabs or sub-sections
      const headers = await page.locator('h1, h2, h3, h4').allTextContents();
      logger.info({ headers: headers.filter(h => h.trim()) }, 'Step 3 headers');
    }

    // ========= Step 4: Competitor Definition =========
    const compLink = page.getByText('Competitor Definition', { exact: true });
    if (await compLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await compLink.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'step4-competitor-definition');

      const step4Text = await page.locator('body').textContent().catch(() => '');
      // Look for key phrases
      const keyPhrases = step4Text?.match(/(add|ingredient|constraint|safety|regulatory|manufacturing|competitor|benchmark|range|min|max|target|objective|goal|priority)/gi);
      logger.info({ keyPhrases: [...new Set(keyPhrases || [])] }, 'Step 4 key phrases');

      const step4Buttons = await page.locator('button').allTextContents();
      logger.info({ buttons: step4Buttons.filter(b => b.trim()) }, 'Step 4 buttons');
    }

    // ========= Step 5: Unable to test outcomes =========
    const unableLink = page.getByText('Unable to test outcomes', { exact: true });
    if (await unableLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unableLink.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'step5-unable-to-test');

      const step5Buttons = await page.locator('button').allTextContents();
      logger.info({ buttons: step5Buttons.filter(b => b.trim()) }, 'Step 5 buttons');
    }

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
