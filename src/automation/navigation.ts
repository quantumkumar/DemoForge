import type { Page } from 'playwright';
import { logger } from '../utils/logger.js';
import { screenshot } from './browser.js';
import { SELECTORS } from './selectors.js';

export type Section = 'ingredients' | 'recipes' | 'projects' | 'datasets';

const SECTION_MAP: Record<Section, keyof typeof SELECTORS.nav> = {
  ingredients: 'ingredientLibrary',
  recipes: 'recipes',
  projects: 'projects',
  datasets: 'datasets',
};

export async function navigateTo(page: Page, section: Section): Promise<void> {
  const selectorKey = SECTION_MAP[section];
  const selector = SELECTORS.nav[selectorKey];

  if (!selector) {
    logger.warn({ section }, `No selector configured for nav.${selectorKey} — attempting text-based navigation`);
    // Fallback: try clicking nav link by text
    const textPatterns: Record<Section, RegExp> = {
      ingredients: /ingredient/i,
      recipes: /recipe|formulation|sku/i,
      projects: /project|innovation/i,
      datasets: /dataset/i,
    };
    const navLink = page.getByRole('link', { name: textPatterns[section] })
      .or(page.getByRole('button', { name: textPatterns[section] }));
    await navLink.first().click();
  } else {
    await page.locator(selector).click();
  }

  await waitForPageReady(page);
  await screenshot(page, `nav-${section}`);
  logger.info({ section }, `Navigated to ${section}`);
}

export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 });

  // Wait for any loading spinners to disappear
  if (SELECTORS.common.loadingSpinner) {
    try {
      await page.locator(SELECTORS.common.loadingSpinner).waitFor({
        state: 'hidden',
        timeout: 10_000,
      });
    } catch {
      // Spinner may not exist on this page
    }
  }
}
