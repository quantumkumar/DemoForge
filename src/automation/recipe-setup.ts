import type { Page } from 'playwright';
import type { SKU, SetupResult } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { screenshot } from './browser.js';
import { navigateTo, waitForPageReady } from './navigation.js';
import { SELECTORS } from './selectors.js';

async function getExistingSKUCodes(page: Page): Promise<Set<string>> {
  const codes = new Set<string>();
  const sel = SELECTORS.recipes;

  if (sel.searchInput) {
    // Can't pre-scan all codes without search; will check per-SKU
    return codes;
  }

  const items = await page.locator(sel.listItem || 'tr, [class*="card"], [class*="item"]').allTextContents();
  for (const text of items) {
    // Try to extract SKU codes (FS-XX-XX pattern)
    const match = text.match(/FS-[A-Z]+-\d+/);
    if (match) codes.add(match[0]);
  }

  logger.info({ count: codes.size }, 'Found existing SKU codes');
  return codes;
}

async function searchForSKU(page: Page, code: string): Promise<boolean> {
  const sel = SELECTORS.recipes;
  if (!sel.searchInput) return false;

  try {
    await page.locator(sel.searchInput).fill(code);
    await waitForPageReady(page);
    const found = await page.locator(`text="${code}"`).count();
    await page.locator(sel.searchInput).fill('');
    await waitForPageReady(page);
    return found > 0;
  } catch {
    return false;
  }
}

async function addFormulationEntry(
  page: Page,
  ingredientName: string,
  percentage: number,
): Promise<void> {
  const sel = SELECTORS.recipes;

  // Click "Add Ingredient" within the recipe form
  if (sel.addIngredientButton) {
    await page.locator(sel.addIngredientButton).click();
  } else {
    await page.getByRole('button', { name: /add.*ingredient/i }).first().click();
  }

  // Search for the ingredient
  if (sel.ingredientSearchInput) {
    await page.locator(sel.ingredientSearchInput).last().fill(ingredientName);
    await waitForPageReady(page);
    // Click the matching result
    await page.locator(`text="${ingredientName}"`).first().click();
  }

  // Enter percentage
  if (sel.ingredientPercentageInput) {
    await page.locator(sel.ingredientPercentageInput).last().fill(String(percentage));
  }

  // Confirm if needed
  if (sel.ingredientConfirmButton) {
    await page.locator(sel.ingredientConfirmButton).click();
  }
}

async function fillRecipeForm(page: Page, sku: SKU): Promise<void> {
  const sel = SELECTORS.recipes;

  // Metadata
  if (sel.nameInput) await page.locator(sel.nameInput).fill(sku.name);
  if (sel.codeInput) await page.locator(sel.codeInput).fill(sku.code);
  if (sel.descriptionInput) await page.locator(sel.descriptionInput).fill(sku.positioningStatement);
  if (sel.demographicInput) await page.locator(sel.demographicInput).fill(sku.targetDemographic);
  if (sel.geoInput) await page.locator(sel.geoInput).fill(sku.targetGeo);

  // Formulation entries
  for (const entry of sku.formulation) {
    await addFormulationEntry(page, entry.ingredientName, entry.percentageW);
  }

  // Processing conditions
  for (const condition of sku.processingConditions) {
    if (sel.addConditionButton) {
      await page.locator(sel.addConditionButton).click();
      if (sel.conditionNameInput) await page.locator(sel.conditionNameInput).last().fill(condition.name);
      if (sel.conditionValueInput) await page.locator(sel.conditionValueInput).last().fill(String(condition.value));
      if (sel.conditionUnitInput) await page.locator(sel.conditionUnitInput).last().fill(condition.unit);
    }
  }

  // Outcome metrics
  for (const outcome of sku.outcomes) {
    if (sel.addOutcomeButton) {
      await page.locator(sel.addOutcomeButton).click();
      if (sel.outcomeNameInput) await page.locator(sel.outcomeNameInput).last().fill(outcome.name);
      if (sel.outcomeValueInput) await page.locator(sel.outcomeValueInput).last().fill(String(outcome.value));
      if (sel.outcomeUnitInput) await page.locator(sel.outcomeUnitInput).last().fill(outcome.unit);
    }
  }

  // Pricing
  if (sel.cogsInput) await page.locator(sel.cogsInput).fill(String(sku.estimatedCOGS));
  if (sel.retailPriceInput) await page.locator(sel.retailPriceInput).fill(String(sku.retailPrice));
}

export async function setupRecipes(
  page: Page,
  skus: SKU[],
): Promise<SetupResult> {
  const startTime = Date.now();
  const result: SetupResult = {
    section: 'Recipes / SKUs',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    screenshotPaths: [],
    durationMs: 0,
  };

  await navigateTo(page, 'recipes');
  const existing = await getExistingSKUCodes(page);

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const progress = `${i + 1}/${skus.length}`;

    if (existing.has(sku.code)) {
      logger.info({ progress, code: sku.code }, `Skipping (exists): ${sku.code}`);
      result.skipped++;
      continue;
    }

    if (SELECTORS.recipes.searchInput) {
      const found = await searchForSKU(page, sku.code);
      if (found) {
        logger.info({ progress, code: sku.code }, `Skipping (found): ${sku.code}`);
        existing.add(sku.code);
        result.skipped++;
        continue;
      }
    }

    try {
      await withRetry(
        async () => {
          if (SELECTORS.recipes.addButton) {
            await page.locator(SELECTORS.recipes.addButton).click();
          } else {
            await page.getByRole('button', { name: /add|create|new/i }).first().click();
          }
          await waitForPageReady(page);

          await fillRecipeForm(page, sku);

          if (SELECTORS.recipes.saveButton) {
            await page.locator(SELECTORS.recipes.saveButton).click();
          } else {
            await page.getByRole('button', { name: /save|submit|create/i }).first().click();
          }
          await waitForPageReady(page);
        },
        { label: `Create recipe: ${sku.code}`, page, maxAttempts: 3 },
      );

      const ssPath = await screenshot(page, `recipe-${sku.code}`);
      result.screenshotPaths.push(ssPath);
      result.created++;
      existing.add(sku.code);
      logger.info({ progress, code: sku.code, name: sku.name }, `Created recipe ${progress}: ${sku.code}`);
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${sku.code}: ${msg}`);
      logger.error({ progress, code: sku.code, error: msg }, `Failed: ${sku.code}`);
    }
  }

  result.durationMs = Date.now() - startTime;
  logger.info(
    { created: result.created, skipped: result.skipped, failed: result.failed },
    `Recipe setup complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`,
  );
  return result;
}
