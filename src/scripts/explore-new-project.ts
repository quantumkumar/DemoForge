/**
 * Click "New Project" on the new tenant and explore the wizard flow.
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

  const session = await launchBrowser({ headed: true, slowMo: 150 });
  const { page } = session;

  try {
    await login(page, { url, email, password });
    await page.waitForTimeout(2000);
    await dismissFloatingButton(page);

    // Click Projects card
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await dismissFloatingButton(page);

    // Click "New Project"
    const newBtn = page.getByRole('button', { name: /new project/i });
    await newBtn.click();
    await page.waitForTimeout(3000);

    await screenshot(page, 'new-project-wizard-step1');
    logger.info({ url: page.url() }, 'After clicking New Project');

    // Check what's on the page
    const allInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      return Array.from(inputs).map(el => ({
        tag: el.tagName,
        id: el.id,
        name: (el as HTMLInputElement).name,
        type: (el as HTMLInputElement).type,
        placeholder: (el as HTMLInputElement).placeholder,
        label: el.closest('.ant-form-item')?.querySelector('label')?.textContent || '',
      }));
    });
    logger.info({ inputs: allInputs }, 'Form inputs');

    const buttons = await page.locator('button').allTextContents();
    logger.info({ buttons: buttons.filter(b => b.trim()) }, 'Buttons');

    // Check for radio buttons or data source options
    const radios = await page.locator('input[type="radio"], .ant-radio-wrapper').allTextContents();
    logger.info({ radios }, 'Radio options');

    // Check for any text about "No Data" or "Upload"
    const bodyText = await page.locator('body').textContent() ?? '';
    const noDataMentions = bodyText.match(/(no data|upload|csv|import|past data)/gi);
    logger.info({ noDataMentions }, 'Data-related text');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
