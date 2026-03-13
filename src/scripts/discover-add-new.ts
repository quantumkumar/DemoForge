/**
 * Discover the "Add new" form on the Inputs & Outcomes step.
 * Navigate to project → select No Data → Next → click "+ Add new" → screenshot form.
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

async function catalogFormElements(page: Page) {
  return page.evaluate(() => {
    // All visible inputs (text, number, search, etc.)
    const inputEls = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea');
    const inputs = Array.from(inputEls).map(el => {
      const inp = el as HTMLInputElement;
      const formItem = el.closest('.ant-form-item, .ant-row, [class*="form"]');
      const label = formItem?.querySelector('label')?.textContent?.trim() || '';
      // Check for nearby text
      const prevSibling = el.previousElementSibling;
      const nearbyText = prevSibling?.textContent?.trim()?.slice(0, 60) || '';
      return {
        tag: el.tagName,
        type: inp.type || '',
        placeholder: inp.placeholder || '',
        id: el.id || '',
        name: inp.name || '',
        label,
        nearbyText,
        value: inp.value?.slice(0, 80) || '',
        visible: (el as HTMLElement).offsetParent !== null,
        classes: el.className.slice(0, 100),
      };
    });

    // Selects
    const selectEls = document.querySelectorAll('.ant-select');
    const selects = Array.from(selectEls).map(el => {
      const parent = el.closest('.ant-form-item, .ant-row, [class*="form"]');
      const label = parent?.querySelector('label')?.textContent?.trim() || '';
      return {
        id: el.id || '',
        text: (el as HTMLElement).textContent?.trim().slice(0, 100) || '',
        label,
        classes: el.className.slice(0, 120),
      };
    });

    // Checkboxes
    const checkEls = document.querySelectorAll('input[type="checkbox"]');
    const checkboxes = Array.from(checkEls).map(el => ({
      label: el.closest('.ant-checkbox-wrapper, label')?.textContent?.trim() || '',
      checked: (el as HTMLInputElement).checked,
    }));

    // Radios
    const radioEls = document.querySelectorAll('input[type="radio"]');
    const radios = Array.from(radioEls).map(el => ({
      label: el.closest('.ant-radio-wrapper, label')?.textContent?.trim() || '',
      value: (el as HTMLInputElement).value,
      checked: (el as HTMLInputElement).checked,
    }));

    // Buttons
    const btnEls = document.querySelectorAll('button');
    const buttons = Array.from(btnEls).map(el => {
      const disabled = el.disabled ? ' (DISABLED)' : '';
      return (el.textContent?.trim() || '') + disabled;
    }).filter(Boolean);

    // Any modal or drawer
    const modals = document.querySelectorAll('.ant-modal, .ant-drawer, [class*="modal"], [class*="Modal"]');
    const modalInfo = Array.from(modals).map(el => ({
      visible: (el as HTMLElement).offsetParent !== null || el.classList.contains('ant-modal-wrap'),
      title: el.querySelector('.ant-modal-title, .ant-drawer-title, [class*="title"]')?.textContent?.trim() || '',
      classes: el.className.slice(0, 100),
    }));

    // All text content in the main area
    const mainContent = document.querySelector('main, [class*="content"], .ant-layout-content')?.textContent?.trim().slice(0, 500) || '';

    // All labels
    const labelEls = document.querySelectorAll('label, .ant-form-item-label');
    const labels = Array.from(labelEls).map(el => el.textContent?.trim() || '').filter(Boolean);

    return { inputs, selects, checkboxes, radios, buttons, modalInfo, mainContent, labels };
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

    logger.info({ url: page.url() }, 'Opened project');

    // Detect if we're on Upload Data step (has "No Data" radio)
    const noDataLabel = page.getByText('No Data', { exact: true });
    if (await noDataLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await noDataLabel.click();
      await page.waitForTimeout(1000);
      logger.info('Selected No Data');

      const nextBtn = page.getByRole('button', { name: /next/i });
      await nextBtn.click({ timeout: 10000 });
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);
      logger.info('Advanced to Inputs & Outcomes');
    } else {
      // May already be on Inputs & Outcomes step
      logger.info('No "No Data" radio found — likely already on Inputs & Outcomes step');

      // Check if we're on Step 1 (Start) and need to click Next
      const projectNameInput = page.locator('input[placeholder="Project Name"]');
      if (await projectNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        logger.info('On Step 1 (Start) — clicking Next');
        const nextBtn = page.getByRole('button', { name: /next/i });
        await nextBtn.click({ timeout: 10000 });
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);

        // Now handle Upload Data step
        const noData2 = page.getByText('No Data', { exact: true });
        if (await noData2.isVisible({ timeout: 3000 }).catch(() => false)) {
          await noData2.click();
          await page.waitForTimeout(1000);
          const nextBtn2 = page.getByRole('button', { name: /next/i });
          await nextBtn2.click({ timeout: 10000 });
          await page.waitForTimeout(3000);
          await dismissFloatingButton(page);
          logger.info('Advanced past Upload Data');
        }
      } else {
        // Check if we see the Inputs & Outcomes table
        const addNewBtn = page.getByRole('button', { name: /add new/i });
        if (await addNewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          logger.info('Already on Inputs & Outcomes step');
        } else {
          // Try clicking sidebar "Inputs & Outcomes"
          const ioLink = page.getByText('Inputs & Outcomes');
          if (await ioLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await ioLink.click();
            await page.waitForTimeout(3000);
            await dismissFloatingButton(page);
            logger.info('Navigated to Inputs & Outcomes via sidebar');
          }
        }
      }
    }

    // We're now on Inputs & Outcomes. Screenshot the table.
    await screenshot(page, 'io-step-before-add');

    // Catalog the page before clicking Add
    const before = await catalogFormElements(page);
    logger.info({ buttons: before.buttons, labels: before.labels }, 'Before Add — elements');

    // Click "+ Add new"
    const addNewBtn = page.getByRole('button', { name: /add new/i });
    if (await addNewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      logger.info('Clicking "+ Add new"');
      await addNewBtn.click();
      await page.waitForTimeout(2000);
      await dismissFloatingButton(page);

      // Screenshot after Add
      await screenshot(page, 'io-step-add-new-clicked');

      // Full catalog of all form elements
      const after = await catalogFormElements(page);
      logger.info({ inputs: after.inputs }, 'After Add — inputs');
      logger.info({ selects: after.selects }, 'After Add — selects');
      logger.info({ checkboxes: after.checkboxes }, 'After Add — checkboxes');
      logger.info({ radios: after.radios }, 'After Add — radios');
      logger.info({ buttons: after.buttons }, 'After Add — buttons');
      logger.info({ modalInfo: after.modalInfo }, 'After Add — modals');
      logger.info({ labels: after.labels }, 'After Add — labels');

      // Take a wider screenshot
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await screenshot(page, 'io-step-add-new-form-top');

      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(500);
      await screenshot(page, 'io-step-add-new-form-scroll1');

      await page.evaluate(() => window.scrollTo(0, 9999));
      await page.waitForTimeout(500);
      await screenshot(page, 'io-step-add-new-form-scroll2');

      // Try to fill in a test variable to see more form fields
      // First, try typing into the Variable Name field
      const varNameInput = page.locator('input[placeholder*="Variable"], input[placeholder*="Name"], input[placeholder*="name"]').first();
      if (await varNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await varNameInput.fill('Test Ingredient');
        await page.waitForTimeout(1000);
        logger.info('Filled variable name');
      }

      // Look for Type Of Variable dropdown
      const typeSelect = page.locator('.ant-select').first();
      if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await typeSelect.click();
        await page.waitForTimeout(1000);
        await screenshot(page, 'io-step-type-dropdown-open');

        // Get all dropdown options
        const options = await page.locator('.ant-select-item-option').allTextContents();
        logger.info({ options }, 'Type Of Variable dropdown options');

        // Click away to close
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);
      }

    } else {
      logger.warn('"+ Add new" button not found');
    }

    // Now try adding a row and saving to see what happens
    logger.info('=== DONE ===');

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
