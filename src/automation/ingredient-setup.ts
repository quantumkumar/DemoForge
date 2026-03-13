import type { Page } from 'playwright';
import type { Ingredient, SetupResult } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { screenshot } from './browser.js';

/**
 * Dismiss the floating button that overlaps other buttons on Turing Labs.
 */
async function dismissFloatingButton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
    if (floater) floater.style.display = 'none';
  });
}

/**
 * Generate a short ingredient code from the name.
 */
function generateCode(name: string, index: number): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .map(w => w.slice(0, 6))
    .join('-')
    .slice(0, 16);
  return `${slug}-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Interact with an Ant Design Select component.
 * Finds the select by the placeholder text within its selector.
 * Handles both searchable (type-ahead) and readonly (simple dropdown) selects.
 */
async function fillAntSelect(page: Page, placeholderText: string, value: string): Promise<void> {
  // Find the select by placeholder text in the selection area
  const selectContainer = page.locator('.ant-select').filter({
    has: page.locator(`[placeholder*="${placeholderText}" i], .ant-select-selection-placeholder:has-text("${placeholderText}")`)
  }).first();

  const selector = selectContainer.locator('.ant-select-selector');
  await selector.click();
  await page.waitForTimeout(500);

  // Check if the inner input is readonly (simple dropdown) or editable (searchable)
  const searchInput = selectContainer.locator('input.ant-select-selection-search-input');
  const isReadonly = await searchInput.getAttribute('readonly').catch(() => null);

  if (isReadonly === null || isReadonly !== null) {
    // For both cases, try typing via keyboard if the input accepts it
    // If readonly, we just need to click the option directly
    if (isReadonly === null) {
      // Editable — type to filter
      await searchInput.fill(value);
      await page.waitForTimeout(800);
    }
  }

  // Click the matching option in the dropdown
  const option = page.locator('.ant-select-item-option-content').filter({ hasText: value }).first();
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click();
  } else {
    // Try broader match
    const optAny = page.locator('.ant-select-item-option').filter({ hasText: value }).first();
    if (await optAny.isVisible({ timeout: 2000 }).catch(() => false)) {
      await optAny.click();
    } else {
      // Press Enter as fallback
      await page.keyboard.press('Enter');
    }
  }
  await page.waitForTimeout(300);
}

/**
 * Search for an ingredient by name in the Ingredient Library.
 * Returns true if found.
 */
async function searchIngredient(page: Page, name: string): Promise<boolean> {
  try {
    const searchInput = page.locator('input[type="search"][placeholder*="Search ingredients"]');
    if (!(await searchInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      return false;
    }

    await searchInput.fill(name);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Check for "No data" empty state
    const noData = page.locator('text=No data').first();
    if (await noData.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchInput.fill('');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      return false;
    }

    // Check if any visible table row text contains the ingredient name (case-insensitive)
    const tableBody = page.locator('table tbody');
    if (await tableBody.isVisible({ timeout: 2000 }).catch(() => false)) {
      const bodyText = await tableBody.textContent().catch(() => '');
      if (bodyText && bodyText.toLowerCase().includes(name.toLowerCase())) {
        await searchInput.fill('');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        return true;
      }
    }

    // Clear search
    await searchInput.fill('');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    return false;
  } catch (err) {
    // If search fails, assume ingredient doesn't exist — will get caught by form validation if duplicate
    logger.debug({ name, error: (err as Error).message }, 'Search failed, assuming not found');
    return false;
  }
}

/**
 * Fill the "Add New Ingredient" form and save.
 * Form fields (discovered):
 *   - input[name="externalCode"]      Code*
 *   - input[name="ingredientName"]    Name*
 *   - ant-select index 0              Supplier (optional, searchable dropdown)
 *   - input[name="functionalRole"]    Functional Role
 *   - input[name="price"]             Cost*
 *   - input[name="unit"]              Cost Unit*
 *   - ant-select index 1              Ingredient Type* (dropdown: Continuous, etc.)
 *   - input[name="value"]             Value*
 *   - input[name="category"]          Category*
 *   - textarea[name="description"]    Description
 */
async function createIngredient(
  page: Page,
  ingredient: Ingredient,
  code: string,
): Promise<void> {
  // Click "Add New Ingredient" button
  await page.getByRole('button', { name: /add new ingredient/i }).click();
  await page.waitForTimeout(800);

  // 1. Code*
  await page.locator('input[name="externalCode"]').fill(code);

  // 2. Ingredient Name*
  await page.locator('input[name="ingredientName"]').fill(ingredient.name);

  // 3. Supplier (Ant Select — type-ahead searchable)
  if (ingredient.supplier) {
    await fillAntSelect(page, 'supplier', ingredient.supplier);
  }

  // 4. Functional Role
  const roleText = ingredient.inci
    ? `${ingredient.category} — INCI: ${ingredient.inci}`
    : ingredient.category;
  await page.locator('input[name="functionalRole"]').fill(roleText);

  // 5. Cost*
  await page.locator('input[name="price"]').fill(String(ingredient.costPerKg));

  // 6. Cost Unit*
  await page.locator('input[name="unit"]').fill('USD/kg');

  // 7. Ingredient Type* (Ant Select — simple dropdown)
  await fillAntSelect(page, 'Select Type', 'Continuous');

  // 8. Lower limit* & Upper limit* (shown when type is "Continuous")
  //    These represent the typical usage range (% in formulation)
  const lowerInput = page.locator('input[placeholder*="lower limit" i]');
  const upperInput = page.locator('input[placeholder*="upper limit" i]');

  if (await lowerInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Derive range from properties — look for numeric values
    const numericProps = Object.values(ingredient.properties).filter(v => typeof v === 'number') as number[];
    const lower = numericProps.length > 0 ? Math.min(...numericProps) : 0;
    const upper = numericProps.length > 0 ? Math.max(...numericProps) : ingredient.costPerKg;
    // Ensure lower < upper
    const lo = Math.min(lower, upper * 0.1);
    const hi = Math.max(upper, lower * 2, 1);
    await lowerInput.fill(String(Math.round(lo * 100) / 100));
    await upperInput.fill(String(Math.round(hi * 100) / 100));
  } else {
    // Fallback: try the "value" input (for non-Continuous types)
    const valueInput = page.locator('input[name="value"]');
    if (await valueInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const propValues = Object.values(ingredient.properties);
      const numericValue = propValues.find(v => typeof v === 'number') ?? ingredient.costPerKg;
      await valueInput.fill(String(numericValue));
    }
  }

  // 9. Category*
  await page.locator('input[name="category"]').fill(ingredient.category);

  // 10. Description
  const desc = ingredient.description
    || `${ingredient.name} (${ingredient.inci}). ${ingredient.regulatoryNotes || ''}`.trim();
  await page.locator('textarea[name="description"]').fill(desc);

  // Click "Save Ingredient"
  await page.getByRole('button', { name: /save ingredient/i }).click();

  // Wait for save to complete
  await page.waitForTimeout(1500);

  // Check for validation errors
  const errorMsgs = page.locator('.ant-form-item-explain-error');
  const errCount = await errorMsgs.count();
  if (errCount > 0) {
    const errors: string[] = [];
    for (let i = 0; i < errCount; i++) {
      const text = await errorMsgs.nth(i).textContent();
      if (text) errors.push(text.trim());
    }
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join('; ')}`);
    }
  }

  // Also check for success message or redirect
  const successMsg = page.locator('.ant-message-success');
  if (await successMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
    logger.debug('Success message shown');
  }
}

/**
 * Navigate to the Ingredient Library from any page.
 */
async function goToIngredientLibrary(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);
  await page.getByText('Ingredient Library').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('Ingredient Library').click();
  await page.getByRole('button', { name: /add new ingredient/i }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1000);
  await dismissFloatingButton(page);
}

export async function setupIngredients(
  page: Page,
  ingredients: Ingredient[],
  baseUrl?: string,
): Promise<SetupResult> {
  const startTime = Date.now();
  const url = baseUrl || process.env.TURING_URL || 'https://staging.turingsaas.com';

  const result: SetupResult = {
    section: 'Ingredient Library',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    screenshotPaths: [],
    durationMs: 0,
  };

  // Navigate to Ingredient Library
  await goToIngredientLibrary(page, url);

  for (let i = 0; i < ingredients.length; i++) {
    const ingredient = ingredients[i];
    const progress = `${i + 1}/${ingredients.length}`;
    const code = generateCode(ingredient.name, i);

    // Idempotency: search for existing ingredient
    const exists = await searchIngredient(page, ingredient.name);
    if (exists) {
      logger.info({ progress, name: ingredient.name }, `Skipping (exists): ${ingredient.name}`);
      result.skipped++;
      continue;
    }

    try {
      await dismissFloatingButton(page);
      await createIngredient(page, ingredient, code);

      result.created++;
      logger.info({ progress, name: ingredient.name }, `Created: ${ingredient.name}`);

      // Screenshot every 10th ingredient or on first/last
      if (i === 0 || (i + 1) % 10 === 0 || i === ingredients.length - 1) {
        const ssPath = await screenshot(page, `ingredient-${i + 1}`);
        result.screenshotPaths.push(ssPath);
      }

      // After save, check if we're back on the list page or still on the form
      const addBtn = page.getByRole('button', { name: /add new ingredient/i });
      if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        // Navigate back to ingredient library
        await goToIngredientLibrary(page, url);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ progress, name: ingredient.name, error: msg }, `Failed: ${ingredient.name}`);
      result.errors.push(`${ingredient.name}: ${msg}`);
      result.failed++;

      // Recover: go back to ingredient library
      try {
        await goToIngredientLibrary(page, url);
      } catch {
        logger.error('Could not recover to ingredient library — aborting remaining');
        break;
      }
    }
  }

  result.durationMs = Date.now() - startTime;
  logger.info(
    { created: result.created, skipped: result.skipped, failed: result.failed, durationMs: result.durationMs },
    `Ingredient setup complete`,
  );
  return result;
}
