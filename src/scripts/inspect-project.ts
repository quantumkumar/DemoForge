/**
 * Navigate into an existing project to see what configuration is available.
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

    await screenshot(page, 'projects-list');

    // Click the first project
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const projectName = await firstRow.locator('td').nth(1).textContent();
      logger.info({ projectName }, 'Clicking first project');
      await firstRow.click();
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);

      await screenshot(page, 'project-detail');
      logger.info({ url: page.url() }, 'Project detail URL');

      // Log all visible sections/tabs
      const tabs = await page.locator('[role="tab"], .ant-tabs-tab, .ant-menu-item').allTextContents();
      logger.info({ tabs: tabs.filter(t => t.trim()) }, 'Tabs/sections');

      // Check sidebar nav items
      const sidebarItems = await page.evaluate(() => {
        const items = document.querySelectorAll('nav a, aside a, [class*="sidebar"] a, [class*="menu"] a, [class*="Menu"] a');
        return Array.from(items).map(el => el.textContent?.trim()).filter(Boolean);
      });
      logger.info({ sidebarItems }, 'Sidebar items');

      // Check all buttons
      const buttons = await page.locator('button').allTextContents();
      logger.info({ buttons: buttons.filter(b => b.trim()) }, 'Buttons');

      // Try "Settings" or "Configure" or "Edit" links
      for (const label of ['Settings', 'Configure', 'Edit', 'Setup', 'Inputs', 'Outcomes']) {
        const link = page.getByText(label, { exact: false }).first();
        if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
          logger.info({ label }, `Found link: ${label}`);
        }
      }
    } else {
      logger.warn('No projects found in table');
    }

  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
