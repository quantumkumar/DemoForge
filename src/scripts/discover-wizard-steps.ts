/**
 * Deep discovery of wizard steps on app.turingsaas.com.
 *
 * Opens an existing project, detects what step we're on,
 * then navigates through all remaining steps using "Next →" button.
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

/**
 * Detect which sidebar step is currently active.
 */
async function detectCurrentStep(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Look for the sidebar items
    const sidebar = document.querySelector('[class*="project-setup"], [class*="ProjectSetup"], aside, nav');
    // Look for active/current step indicators
    const allStepTexts = ['Start', 'Upload Data', 'Inputs & Outcomes', 'Competitor Definition', 'Unable to test outcomes'];

    // Check for page title/header
    const mainTitle = document.querySelector('h1, h2, [class*="title"]');
    if (mainTitle) {
      const titleText = mainTitle.textContent?.trim() || '';
      if (titleText.includes('Project Info')) return 'Start';
      if (titleText.includes('Inputs & Outcomes') || titleText.includes('Upload')) return 'Upload Data';
      if (titleText.includes('Competitor')) return 'Competitor Definition';
      if (titleText.includes('Unable')) return 'Unable to test outcomes';
    }

    // Check which sidebar item has the active dot/indicator
    const sidebarLinks = document.querySelectorAll('[class*="sidebar"] *, aside *, nav *');
    for (const el of sidebarLinks) {
      const text = el.textContent?.trim();
      if (text && allStepTexts.includes(text)) {
        const parent = el.parentElement;
        if (parent?.querySelector('[class*="active"], [class*="current"]') ||
            parent?.classList.toString().includes('active')) {
          return text;
        }
      }
    }

    // Fallback: check page content
    const bodyText = document.body.textContent || '';
    if (bodyText.includes('Please share inputs and outcomes')) return 'Upload Data';
    if (bodyText.includes('Project Info') || bodyText.includes('Craft Your Project')) return 'Start';

    return 'unknown';
  });
}

/**
 * Catalog all interactive elements on the current page.
 */
async function catalogElements(page: Page): Promise<{
  inputs: Array<{ tag: string; type: string; placeholder: string; id: string; name: string; label: string; value: string }>;
  buttons: string[];
  selects: Array<{ id: string; text: string }>;
  headers: string[];
  paragraphs: string[];
  tables: Array<{ rows: number; cols: number; headers: string[] }>;
  checkboxes: Array<{ label: string; checked: boolean }>;
  radios: Array<{ label: string; value: string; checked: boolean }>;
}> {
  return page.evaluate(() => {
    // Text inputs
    const inputEls = document.querySelectorAll('input[type="text"], input[type="number"], input[type="search"], textarea');
    const inputs = Array.from(inputEls).map(el => {
      const inp = el as HTMLInputElement;
      const formItem = el.closest('.ant-form-item');
      const label = formItem?.querySelector('label')?.textContent?.trim() || '';
      return {
        tag: el.tagName,
        type: inp.type || '',
        placeholder: inp.placeholder || '',
        id: el.id || '',
        name: inp.name || '',
        label,
        value: inp.value?.slice(0, 80) || '',
      };
    });

    // Buttons
    const btnEls = document.querySelectorAll('button');
    const buttons = Array.from(btnEls).map(el => {
      const text = el.textContent?.trim() || '';
      const disabled = el.disabled ? ' (DISABLED)' : '';
      return text + disabled;
    }).filter(Boolean);

    // Selects
    const selectEls = document.querySelectorAll('.ant-select');
    const selects = Array.from(selectEls).map(el => ({
      id: el.id || '',
      text: (el as HTMLElement).textContent?.trim().slice(0, 100) || '',
    }));

    // Headers
    const headerEls = document.querySelectorAll('h1, h2, h3, h4, h5');
    const headers = Array.from(headerEls).map(el => el.textContent?.trim() || '').filter(Boolean);

    // Paragraphs
    const pEls = document.querySelectorAll('p');
    const paragraphs = Array.from(pEls).map(el => el.textContent?.trim().slice(0, 200) || '').filter(Boolean);

    // Tables
    const tableEls = document.querySelectorAll('table');
    const tables = Array.from(tableEls).map(table => ({
      rows: table.querySelectorAll('tbody tr').length,
      cols: table.querySelectorAll('thead th').length,
      headers: Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.trim() || ''),
    }));

    // Checkboxes
    const checkboxEls = document.querySelectorAll('input[type="checkbox"]');
    const checkboxes = Array.from(checkboxEls).map(el => {
      const inp = el as HTMLInputElement;
      const wrapper = el.closest('.ant-checkbox-wrapper, label');
      return {
        label: wrapper?.textContent?.trim() || '',
        checked: inp.checked,
      };
    });

    // Radios
    const radioEls = document.querySelectorAll('input[type="radio"]');
    const radios = Array.from(radioEls).map(el => {
      const inp = el as HTMLInputElement;
      const wrapper = el.closest('.ant-radio-wrapper, label');
      return {
        label: wrapper?.textContent?.trim() || '',
        value: inp.value || '',
        checked: inp.checked,
      };
    });

    return { inputs, buttons, selects, headers, paragraphs, tables, checkboxes, radios };
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

    const currentStep = await detectCurrentStep(page);
    logger.info({ currentStep, url: page.url() }, 'Opened project — detected step');

    // Take initial screenshot
    await screenshot(page, 'discover-initial');
    const initial = await catalogElements(page);
    logger.info({
      headers: initial.headers,
      buttons: initial.buttons,
      radios: initial.radios,
      inputs: initial.inputs.length,
    }, 'Initial page elements');

    // ===== HANDLE STEP 2: Upload Data =====
    // If we're on Upload Data step, select "No Data" to enable Next
    if (initial.radios.some(r => r.value === 'no-data') || initial.headers.some(h => h.includes('share inputs'))) {
      logger.info('On Upload Data step — selecting "No Data" radio');

      // Click the "No Data" radio button
      const noDataLabel = page.getByText('No Data', { exact: true });
      if (await noDataLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
        await noDataLabel.click();
        await page.waitForTimeout(2000);
        logger.info('Selected "No Data" radio');
      } else {
        // Try clicking the radio input directly
        const noDataRadio = page.locator('input[type="radio"][value="no-data"]');
        await noDataRadio.click({ force: true });
        await page.waitForTimeout(2000);
      }

      await screenshot(page, 'discover-step2-nodata-selected');

      // Check if Next is now enabled
      const nextEnabled = await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.includes('Next')) {
            return !btn.disabled;
          }
        }
        return false;
      });
      logger.info({ nextEnabled }, 'Next button status after No Data selection');

      // Click Next → (use force if still disabled somehow)
      const nextBtn = page.getByRole('button', { name: /next/i });
      if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        try {
          await nextBtn.click({ timeout: 10000 });
        } catch {
          logger.warn('Next button click timed out, trying force click');
          await nextBtn.click({ force: true });
        }
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);
        logger.info('Advanced past Upload Data step');
      }
    }

    // ===== STEP 3: Inputs & Outcomes =====
    logger.info('=== STEP 3: Inputs & Outcomes ===');
    await screenshot(page, 'discover-step3-inputs-outcomes');
    const step3 = await catalogElements(page);
    logger.info({ headers: step3.headers }, 'Step 3 headers');
    logger.info({ buttons: step3.buttons }, 'Step 3 buttons');
    logger.info({ inputs: step3.inputs }, 'Step 3 inputs');
    logger.info({ selects: step3.selects }, 'Step 3 selects');
    logger.info({ radios: step3.radios }, 'Step 3 radios');
    logger.info({ checkboxes: step3.checkboxes }, 'Step 3 checkboxes');
    logger.info({ paragraphs: step3.paragraphs }, 'Step 3 text');
    logger.info({ tables: step3.tables }, 'Step 3 tables');
    logger.info({ url: page.url() }, 'Step 3 URL');

    // Look for "Add" or "+" buttons
    const addBtns = page.locator('button').filter({ hasText: /add|create|\+|new/i });
    const addBtnTexts = await addBtns.allTextContents();
    logger.info({ addButtons: addBtnTexts.filter(t => t.trim()) }, 'Add buttons on Step 3');

    // Try clicking an Add button to see what form it reveals
    const addInputBtn = page.locator('button').filter({ hasText: /add.*input|add.*variable|add.*ingredient|\+ add/i }).first();
    if (await addInputBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logger.info('Found Add Input button, clicking it');
      await addInputBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, 'discover-step3-add-input-form');
      const addForm = await catalogElements(page);
      logger.info({ inputs: addForm.inputs, selects: addForm.selects }, 'Add Input form elements');

      // Close the form / cancel
      const cancelBtn = page.getByRole('button', { name: /cancel|close/i }).first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Scroll to see all content
    await page.evaluate(() => window.scrollTo(0, 9999));
    await page.waitForTimeout(1000);
    await screenshot(page, 'discover-step3-scrolled');

    // Click Next → to Step 4
    const nextBtn3 = page.getByRole('button', { name: /next/i });
    if (await nextBtn3.isVisible({ timeout: 5000 }).catch(() => false)) {
      try {
        await nextBtn3.click({ timeout: 10000 });
      } catch {
        await nextBtn3.click({ force: true });
      }
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);
      logger.info('Advanced to Step 4');
    }

    // ===== STEP 4: Competitor Definition =====
    logger.info('=== STEP 4: Competitor Definition ===');
    await screenshot(page, 'discover-step4-competitor');
    const step4 = await catalogElements(page);
    logger.info({ headers: step4.headers }, 'Step 4 headers');
    logger.info({ buttons: step4.buttons }, 'Step 4 buttons');
    logger.info({ inputs: step4.inputs }, 'Step 4 inputs');
    logger.info({ selects: step4.selects }, 'Step 4 selects');
    logger.info({ paragraphs: step4.paragraphs }, 'Step 4 text');
    logger.info({ tables: step4.tables }, 'Step 4 tables');
    logger.info({ checkboxes: step4.checkboxes }, 'Step 4 checkboxes');
    logger.info({ url: page.url() }, 'Step 4 URL');

    // Look for Add buttons on Step 4
    const addBtns4 = page.locator('button').filter({ hasText: /add|create|\+|new/i });
    const addBtnTexts4 = await addBtns4.allTextContents();
    logger.info({ addButtons: addBtnTexts4.filter(t => t.trim()) }, 'Add buttons on Step 4');

    // Scroll
    await page.evaluate(() => window.scrollTo(0, 9999));
    await page.waitForTimeout(1000);
    await screenshot(page, 'discover-step4-scrolled');

    // Click Next → to Step 5
    const nextBtn4 = page.getByRole('button', { name: /next/i });
    if (await nextBtn4.isVisible({ timeout: 5000 }).catch(() => false)) {
      try {
        await nextBtn4.click({ timeout: 10000 });
      } catch {
        await nextBtn4.click({ force: true });
      }
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);
      logger.info('Advanced to Step 5');
    }

    // ===== STEP 5: Unable to test outcomes =====
    logger.info('=== STEP 5: Unable to test outcomes ===');
    await screenshot(page, 'discover-step5-unable');
    const step5 = await catalogElements(page);
    logger.info({ headers: step5.headers }, 'Step 5 headers');
    logger.info({ buttons: step5.buttons }, 'Step 5 buttons');
    logger.info({ inputs: step5.inputs }, 'Step 5 inputs');
    logger.info({ selects: step5.selects }, 'Step 5 selects');
    logger.info({ paragraphs: step5.paragraphs }, 'Step 5 text');
    logger.info({ tables: step5.tables }, 'Step 5 tables');
    logger.info({ checkboxes: step5.checkboxes }, 'Step 5 checkboxes');
    logger.info({ url: page.url() }, 'Step 5 URL');

    // Scroll
    await page.evaluate(() => window.scrollTo(0, 9999));
    await page.waitForTimeout(1000);
    await screenshot(page, 'discover-step5-scrolled');

    // === Summary ===
    logger.info('=== DISCOVERY COMPLETE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
