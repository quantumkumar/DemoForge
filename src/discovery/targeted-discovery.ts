import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';

async function extractPageElements(page: Page, label: string) {
  await screenshot(page, label);

  const elements = await page.evaluate(() => {
    const results: Record<string, unknown[]> = { buttons: [], inputs: [], selects: [], links: [], tables: [], modals: [] };

    document.querySelectorAll('button, [role="button"]').forEach(el => {
      results.buttons.push({
        text: (el as HTMLElement).innerText?.trim().slice(0, 80),
        testId: el.getAttribute('data-testid'),
        ariaLabel: el.getAttribute('aria-label'),
        classes: el.className?.toString().slice(0, 120),
        type: el.getAttribute('type'),
      });
    });

    document.querySelectorAll('input, textarea').forEach(el => {
      results.inputs.push({
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        label: el.getAttribute('aria-label') || el.closest('label')?.textContent?.trim().slice(0, 60),
        testId: el.getAttribute('data-testid'),
        id: el.id,
      });
    });

    document.querySelectorAll('select, [role="listbox"], [role="combobox"]').forEach(el => {
      results.selects.push({
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        testId: el.getAttribute('data-testid'),
        id: el.id,
        options: Array.from(el.querySelectorAll('option')).map(o => (o as HTMLOptionElement).text).slice(0, 20),
      });
    });

    document.querySelectorAll('table').forEach(el => {
      const headers = Array.from(el.querySelectorAll('th')).map(th => (th as HTMLElement).innerText?.trim());
      const rowCount = el.querySelectorAll('tbody tr').length;
      results.tables.push({ headers, rowCount, testId: el.getAttribute('data-testid') });
    });

    document.querySelectorAll('[role="dialog"], .modal, .MuiDialog-root, .MuiDrawer-root').forEach(el => {
      results.modals.push({
        title: el.querySelector('h1, h2, h3, [class*="title"]')?.textContent?.trim(),
        visible: (el as HTMLElement).offsetParent !== null,
      });
    });

    return results;
  });

  logger.info({ label, ...elements }, `Page elements for: ${label}`);
  return elements;
}

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  const session = await launchBrowser({ headed: true, slowMo: 200 });
  const { page } = session;

  try {
    await login(page, { url, email, password });
    await extractPageElements(page, 'dashboard');

    // ── 1. Ingredient Library ──────────────────────────
    logger.info('=== Exploring Ingredient Library ===');
    await page.getByText('Ingredient Library').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await extractPageElements(page, 'ingredient-library-list');

    // Dismiss the floating button that blocks clicks
    await page.evaluate(() => {
      const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
      if (floater) floater.style.display = 'none';
    });

    // Click "Add New Ingredient"
    const addIngBtn = page.getByRole('button', { name: /add new ingredient/i });
    if (await addIngBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addIngBtn.click();
      await page.waitForTimeout(3000);
      await extractPageElements(page, 'ingredient-add-form');

      // Try to close form/modal/drawer
      const cancelBtn = page.getByRole('button', { name: /cancel|close|back|discard/i }).first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(1000);
      } else {
        // Try pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      logger.warn('No "Add New Ingredient" button found');
    }

    // Go back to dashboard
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ── 2. Projects ────────────────────────────────────
    logger.info('=== Exploring Projects ===');
    await page.getByText('Projects', { exact: true }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
      if (floater) floater.style.display = 'none';
    });
    await extractPageElements(page, 'projects-list');

    // Look for Create Project button
    const createProjBtn = page.getByRole('button', { name: /create|add|new/i }).first();
    if (await createProjBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createProjBtn.click();
      await page.waitForTimeout(3000);
      await extractPageElements(page, 'project-create-form');

      const cancelBtn = page.getByRole('button', { name: /cancel|close|back|discard/i }).first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      logger.warn('No Create button found on projects page');
      const allBtns = await page.getByRole('button').allInnerTexts();
      logger.info({ buttons: allBtns }, 'All buttons on projects page');
    }

    // Go back to dashboard
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ── 3. Products ────────────────────────────────────
    logger.info('=== Exploring Products ===');
    await page.getByText('Products', { exact: true }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
      if (floater) floater.style.display = 'none';
    });
    await extractPageElements(page, 'products-list');

    // Look for Create Product button
    const createProdBtn = page.getByRole('button', { name: /create|add|new/i }).first();
    if (await createProdBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createProdBtn.click();
      await page.waitForTimeout(3000);
      await extractPageElements(page, 'product-create-form');

      const cancelBtn = page.getByRole('button', { name: /cancel|close|back|discard/i }).first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } else {
      logger.warn('No Create button found on products page');
      const allBtns = await page.getByRole('button').allInnerTexts();
      logger.info({ buttons: allBtns }, 'All buttons on products page');
    }

    // Go back to dashboard
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ── 4. Dataset Library ─────────────────────────────
    logger.info('=== Exploring Dataset Library ===');
    await page.getByText('Dataset Library').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await extractPageElements(page, 'dataset-library');

    // ── 5. Supplier Library ────────────────────────────
    logger.info('=== Exploring Supplier Library ===');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByText('Supplier Library').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await extractPageElements(page, 'supplier-library');

    // ── 6. Check hamburger menu ────────────────────────
    logger.info('=== Exploring hamburger menu ===');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const hamburger = page.locator('button').filter({ has: page.locator('svg') }).first();
    if (await hamburger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hamburger.click();
      await page.waitForTimeout(1500);
      await extractPageElements(page, 'hamburger-menu');
    }

    logger.info('=== Targeted discovery complete ===');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
