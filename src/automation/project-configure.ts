/**
 * Configure project variables (inputs & outcomes) on the Inputs & Outcomes step.
 *
 * Enhanced flow (v2):
 *   1. For each committed row, click cost/type column → enters edit mode (.addingRow)
 *   2. Set correct Type Of Variable (Existing ingredient / Filler ingredient / Processing / outcome types)
 *   3. Fill Cost ($/Kg), Category, Descriptive Functional Role
 *   4. Click checkmark to save
 *   5. After all rows, click Next
 *
 * Row structure: div.row-table.addingRow (NOT <tr>)
 *   Columns: variable-name | name (type) | data-type | observed-values |
 *            project-bounds | outcome-priority | cost | cost | unit |
 *            input-category | test-condition | actions-column
 *
 * Edit mode: Click .cost or .name column on committed row → row gets .addingRow class.
 */
import type { Page } from 'playwright';
import type { InnovationProject, Ingredient, SetupResult } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { screenshot } from './browser.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Ingredient Metadata Lookup ────────────────────────────

interface IngredientMeta {
  costPerKg: number;
  category: string;
  description: string;
}

/** Build a case-insensitive lookup map from ingredient arrays. */
function buildIngredientLookup(ingredients: Ingredient[]): Map<string, IngredientMeta> {
  const map = new Map<string, IngredientMeta>();
  for (const ing of ingredients) {
    const key = ing.name.toLowerCase().trim();
    map.set(key, {
      costPerKg: ing.costPerKg,
      category: ing.category,
      description: ing.description || `${ing.category} ingredient`,
    });
    // Also add trade name aliases
    if (ing.tradeName) {
      map.set(ing.tradeName.toLowerCase().trim(), {
        costPerKg: ing.costPerKg,
        category: ing.category,
        description: ing.description || `${ing.category} ingredient`,
      });
    }
  }
  // Common abbreviation aliases
  const aliases: Record<string, string> = {
    'sls': 'sodium lauryl sulfate',
    'sles': 'sodium laureth sulfate',
    'sci': 'sodium cocoyl isethionate',
    'mfp': 'sodium monofluorophosphate',
    'peg-8': 'peg-8',
    'hpc': 'hydroxypropyl cellulose',
  };
  for (const [alias, fullName] of Object.entries(aliases)) {
    const meta = map.get(fullName);
    if (meta && !map.has(alias)) map.set(alias, meta);
  }
  return map;
}

// ── Outcome Functional Roles ──────────────────────────────

const OUTCOME_ROLES: Record<string, string> = {
  'Foam Volume': 'Foaming performance metric',
  'Foam volume': 'Foaming performance metric',
  'Overall Sensory Score': 'Consumer sensory panel evaluation',
  'COGS per unit': 'Manufacturing cost target',
  'COGS Per Unit': 'Manufacturing cost target',
  'Viscosity': 'Rheological stability parameter',
  'Fluoride Release': 'Therapeutic efficacy metric',
  'Shelf Stability': 'Product aging performance',
  'Skin Irritation Score': 'Dermal safety assessment',
  'Whitening Shade Change': 'Aesthetic efficacy metric',
  'RDA': 'Abrasivity safety metric',
  'Enamel Safety Index': 'Enamel protection assessment',
  'Anti-gingivitis Efficacy': 'Therapeutic efficacy metric',
  'Remineralization Index': 'Enamel repair performance',
  'pH': 'Formulation stability parameter',
  'Natural Origin Index': 'Clean label compliance',
  'Dandruff Reduction': 'Anti-dandruff efficacy metric',
  'Scalp Irritation Score': 'Scalp safety assessment',
  'Flash Lather Score': 'Quick-foam performance metric',
  'Wet Combing Force Reduction': 'Conditioning performance metric',
};

const PROCESSING_ROLES: Record<string, string> = {
  'Mixing Speed': 'Homogeneity control parameter',
  'Temperature': 'Reaction kinetics parameter',
  'Mixing Time': 'Process duration parameter',
};

// ── Filler Ingredient Selection ───────────────────────────

/** Determine the filler ingredient for a project (the one with the widest range among humectants/solvents). */
function selectFillerIngredient(project: InnovationProject, ingredientLookup: Map<string, IngredientMeta>): string {
  const ingredientInputs = project.inputs.filter(i => i.type === 'ingredient_percentage');
  if (ingredientInputs.length === 0) return '';

  // Prefer humectants/solvents, then largest range
  let bestFiller = '';
  let bestScore = -1;

  for (const input of ingredientInputs) {
    const name = extractIngredientName(input.name);
    const meta = ingredientLookup.get(name.toLowerCase());
    const range = input.range.max - input.range.min;
    // Humectant/Solvent bonus
    const categoryBonus = (meta?.category === 'Humectant' || meta?.category === 'Solvent') ? 1000 : 0;
    const score = range + categoryBonus;
    if (score > bestScore) {
      bestScore = score;
      bestFiller = name;
    }
  }

  return bestFiller;
}

// ── Helpers ────────────────────────────────────────────────

async function dismissFloatingButton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const floater = document.querySelector('.consolidated-float-button-draggable') as HTMLElement;
    if (floater) floater.style.display = 'none';
  });
}

function priorityLabel(importance: string): string {
  switch (importance) {
    case 'primary': return 'High';
    case 'secondary': return 'Medium';
    case 'tertiary': return 'Low';
    default: return 'Low';
  }
}

function extractIngredientName(inputName: string): string {
  return inputName.replace(/\s*%\s*$/, '').trim();
}

function classifyOutcomeType(outcomeName: string): string {
  const lower = outcomeName.toLowerCase();
  const sensory = ['sensory', 'foam', 'lather', 'irritation', 'texture', 'feel', 'taste', 'flavor', 'mouthfeel', 'combing'];
  if (sensory.some(kw => lower.includes(kw))) return 'Sensory outcome';
  const consumer = ['consumer', 'purchase', 'satisfaction', 'preference', 'intent', 'liking', 'appeal'];
  if (consumer.some(kw => lower.includes(kw))) return 'Consumer outcome';
  return 'Analytical outcome';
}

// ── CSV Generation for Upload Data step ───────────────────

function generateProjectCSV(project: InnovationProject): string {
  const tmpDir = join(process.cwd(), '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  const inputHeaders = project.inputs.map(i => extractIngredientName(i.name));
  const outcomeHeaders = project.outcomes.map(o => o.name);
  const allVarHeaders = [...inputHeaders, ...outcomeHeaders];
  const allHeaders = ['FormulationID', 'Type', ...allVarHeaders];

  const rows: string[][] = [];
  const types = ['Past formulation', 'Past formulation', 'Past formulation', 'Past formulation',
                 'Past formulation', 'Past formulation', 'Benchmark', 'Competitive'];
  for (let r = 0; r < 8; r++) {
    const row: string[] = [];
    row.push(`T${String(r + 1).padStart(2, '0')}`);
    row.push(types[r]);
    for (const input of project.inputs) {
      const { min, max } = input.range;
      const val = min + Math.random() * (max - min);
      const decimals = (max - min) < 1 ? 3 : (max - min) < 10 ? 2 : 1;
      row.push(val.toFixed(decimals));
    }
    for (const outcome of project.outcomes) {
      let val: number;
      if (outcome.targetValue != null) {
        const spread = outcome.targetValue * 0.2;
        val = outcome.targetValue + (Math.random() - 0.5) * 2 * spread;
      } else if (outcome.direction === 'maximize') {
        val = 50 + Math.random() * 50;
      } else if (outcome.direction === 'minimize') {
        val = Math.random() * 5;
      } else {
        val = 50 + Math.random() * 50;
      }
      val = Math.max(0, val);
      const decimals = val < 10 ? 2 : 1;
      row.push(val.toFixed(decimals));
    }
    rows.push(row);
  }

  const csvLines = [allHeaders.join(','), ...rows.map(r => r.join(','))];
  const csvContent = csvLines.join('\r\n');

  const safeName = project.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const filePath = join(tmpDir, `${safeName}_data.csv`);
  writeFileSync(filePath, csvContent, 'utf-8');
  logger.info({ path: filePath, rows: rows.length, cols: allHeaders.length }, 'Generated CSV');
  return filePath;
}

// ── Set Type Of Variable dropdown ─────────────────────────

async function setTypeOfVariable(page: Page, typeName: string, rowLocator?: ReturnType<Page['locator']>): Promise<boolean> {
  // Only blur + Escape when NOT in committed-row edit mode
  // (Escape would cancel the edit mode for committed rows)
  if (!rowLocator) {
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Find the type dropdown
  let typeSelectEl: ReturnType<Page['locator']> | null = null;

  if (rowLocator) {
    // For a specific row: .select-input-type is inside the .name column
    const selectInputType = rowLocator.locator('.select-input-type').first();
    if (await selectInputType.isVisible({ timeout: 1500 }).catch(() => false)) {
      typeSelectEl = selectInputType;
    }
  } else {
    // Default: look in any .addingRow
    const selectInputType = page.locator('.addingRow .select-input-type').last();
    if (await selectInputType.isVisible({ timeout: 500 }).catch(() => false)) {
      typeSelectEl = selectInputType;
    }
  }

  if (!typeSelectEl) {
    logger.warn(`Could not find type dropdown for: ${typeName}`);
    return false;
  }

  await typeSelectEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  await typeSelectEl.locator('.ant-select-selector').click();
  await page.waitForTimeout(1200);

  const typeOption = page.locator('.ant-select-item-option').filter({ hasText: typeName }).first();
  if (await typeOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await typeOption.click();
    await page.waitForTimeout(400);
    return true;
  }

  // Retry once
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await typeSelectEl.locator('.ant-select-selector').click({ force: true });
  await page.waitForTimeout(1200);

  const typeOption2 = page.locator('.ant-select-item-option').filter({ hasText: typeName }).first();
  if (await typeOption2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await typeOption2.click();
    await page.waitForTimeout(400);
    return true;
  }

  await page.keyboard.press('Escape');
  logger.warn(`Could not set type: ${typeName}`);
  return false;
}

// ── Set Outcome Priority dropdown ─────────────────────────

async function setPriority(page: Page, priority: string): Promise<boolean> {
  const allSelects = page.locator('.ant-select');
  const count = await allSelects.count();

  for (let i = count - 1; i >= 0; i--) {
    const sel = allSelects.nth(i);
    const text = await sel.textContent().catch(() => '');
    if (text?.includes('Low') || text?.includes('Medium') || text?.includes('High')) {
      const classes = await sel.getAttribute('class').catch(() => '') ?? '';
      if (classes.includes('select-input-type') || classes.includes('auto-complete')) continue;
      if (classes.includes('ant-select-disabled')) continue;

      await sel.locator('.ant-select-selector').click();
      await page.waitForTimeout(500);

      const priOption = page.locator('.ant-select-item-option').filter({ hasText: priority }).first();
      if (await priOption.isVisible({ timeout: 1500 }).catch(() => false)) {
        await priOption.click();
        await page.waitForTimeout(300);
        return true;
      }
      await page.keyboard.press('Escape');
      break;
    }
  }
  return false;
}

// ── Fill metadata fields in .addingRow ─────────────────────

async function fillMetadataFields(
  page: Page,
  addingRow: ReturnType<Page['locator']>,
  opts: {
    cost?: number;
    category?: string;
    functionalRole?: string;
  },
): Promise<void> {
  // Fill Cost value (Col 6: .cost with ant-input-number-input)
  if (opts.cost != null) {
    // The cost VALUE is the ant-input-number inside the first .cost column
    const costValueInput = addingRow.locator('.cost .ant-input-number-input').first();
    if (await costValueInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await costValueInput.isDisabled().catch(() => true);
      if (!disabled) {
        await costValueInput.fill(String(opts.cost));
        await page.waitForTimeout(200);
      }
    }
    // Also fill Cost Unit field with "$/Kg" (Col 7: input[placeholder="$/Kg"])
    const costUnitInput = addingRow.locator('input[placeholder="$/Kg"]');
    if (await costUnitInput.isVisible({ timeout: 500 }).catch(() => false)) {
      const disabled = await costUnitInput.isDisabled().catch(() => true);
      if (!disabled) {
        await costUnitInput.fill('$/Kg');
        await page.waitForTimeout(200);
      }
    }
  }

  // Fill Category (.input-category input)
  if (opts.category) {
    const catInput = addingRow.locator('.input-category input');
    if (await catInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await catInput.isDisabled().catch(() => true);
      if (!disabled) {
        await catInput.fill(opts.category);
        await page.waitForTimeout(200);
      }
    }
  }

  // Fill Descriptive Functional Role (.test-condition input.ant-input)
  if (opts.functionalRole) {
    // The functional role field is in the test-condition column
    const roleInput = addingRow.locator('.test-condition input.ant-input');
    if (await roleInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await roleInput.isDisabled().catch(() => true);
      if (!disabled) {
        await roleInput.fill(opts.functionalRole);
        await page.waitForTimeout(200);
      }
    } else {
      // Fallback: try finding by placeholder pattern
      const antInputs = addingRow.locator('input.ant-input');
      const inputCount = await antInputs.count();
      for (let i = 0; i < inputCount; i++) {
        const inp = antInputs.nth(i);
        if (await inp.isVisible().catch(() => false)) {
          const ph = await inp.getAttribute('placeholder').catch(() => '');
          if (ph?.includes('emulsifier') || ph?.includes('Powdered') || ph?.includes('functional') || ph?.includes('role')) {
            await inp.fill(opts.functionalRole);
            await page.waitForTimeout(200);
            break;
          }
        }
      }
    }
  }
}

// ── Commit (checkmark) and handle result ──────────────────

async function commitRow(page: Page, rowLocator: ReturnType<Page['locator']>, varName: string): Promise<boolean> {
  // Try .add-ingredient first (new rows)
  const addBtn = rowLocator.locator('.add-ingredient');
  if (await addBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();
    await page.waitForTimeout(2000);
  } else {
    // Committed-row edit mode: checkmark is first .action-button in .actions-column
    const actionBtn = rowLocator.locator('.actions-column .action-button').first();
    if (await actionBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await actionBtn.scrollIntoViewIfNeeded();
      await actionBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Last resort: try "+ Add" button
      const addBtnFb = page.locator('button').filter({ hasText: /^\+\s*Add$/ }).last();
      if (await addBtnFb.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addBtnFb.click();
        await page.waitForTimeout(2000);
      } else {
        logger.warn({ name: varName }, 'No commit button found');
        return false;
      }
    }
  }

  const toastText = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.ant-notification-notice');
    return Array.from(nodes).map(n => n.textContent?.trim()?.slice(0, 200) || '').join(' | ');
  });

  await page.locator('.ant-notification-notice-close').first().click().catch(() => {});
  await page.waitForTimeout(300);

  if (toastText.includes('successfully')) {
    return true;
  }

  if (toastText) {
    logger.warn({ toast: toastText, name: varName }, 'Commit failed');

    // If "Functional Role is required", retry with Processing type
    if (toastText.includes('Functional Role')) {
      logger.info({ name: varName }, 'Retrying with Processing type');
      return false; // caller will handle fallback
    }
  } else {
    // No toast = assume success if commit button was clicked and row exited edit mode
    // Check if the row is still in edit mode (.addingRow)
    const stillEditing = await rowLocator.evaluate(
      el => el.classList.contains('addingRow')
    ).catch(() => false);
    if (!stillEditing) return true;
    // Row still in edit mode and no toast — could be a timing issue
    await page.waitForTimeout(1000);
    const stillEditingRetry = await rowLocator.evaluate(
      el => el.classList.contains('addingRow')
    ).catch(() => false);
    if (!stillEditingRetry) return true;
  }

  return false;
}

// ── Core: Add a single variable row ───────────────────────

async function addVariableRow(
  page: Page,
  opts: {
    name: string;
    typeOfVariable: string;
    lowerBound: number;
    upperBound: number;
    priority: string;
    unit: string;
    cost?: number;
    category?: string;
    functionalRole?: string;
  },
): Promise<boolean> {
  try {
    const addNewBtn = page.getByRole('button', { name: /add new/i });
    if (!await addNewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logger.warn({ name: opts.name }, 'No "+ Add new" button visible');
      return false;
    }
    await addNewBtn.click();
    await page.waitForTimeout(1500);

    // Set Type FIRST
    let typeToUse = opts.typeOfVariable;
    const typeSet = await setTypeOfVariable(page, typeToUse);
    if (!typeSet) {
      // If Existing/Filler ingredient type not available, fall back to Processing
      if (typeToUse === 'Existing ingredient' || typeToUse === 'Filler ingredient') {
        typeToUse = 'Processing';
        await setTypeOfVariable(page, typeToUse);
      } else {
        logger.warn({ name: opts.name, type: typeToUse }, 'Type not set');
        return false;
      }
    }

    // Set Variable Name
    const acInput = page.locator('.ant-select-auto-complete input').last();
    await acInput.click();
    await page.waitForTimeout(300);
    await acInput.fill('');
    await acInput.pressSequentially(opts.name, { delay: 40 });
    await page.waitForTimeout(1000);
    await acInput.press('Enter');
    await page.waitForTimeout(400);

    const addingRow = page.locator('.addingRow').last();

    // Fill bounds
    const lb = addingRow.locator('input[placeholder="lower bound"]');
    if (await lb.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await lb.isDisabled().catch(() => true);
      if (!disabled) await lb.fill(String(opts.lowerBound));
    }
    const ub = addingRow.locator('input[placeholder="upper bound"]');
    if (await ub.isVisible({ timeout: 1000 }).catch(() => false)) {
      const disabled = await ub.isDisabled().catch(() => true);
      if (!disabled) await ub.fill(String(opts.upperBound));
    }
    await page.waitForTimeout(200);

    // Fill unit
    const unitInput = addingRow.locator('input[placeholder="%/grm"]');
    if (await unitInput.isVisible({ timeout: 500 }).catch(() => false)) {
      const disabled = await unitInput.isDisabled().catch(() => true);
      if (!disabled) await unitInput.fill(opts.unit);
    }

    // Fill priority
    if (opts.priority !== 'Low') {
      await setPriority(page, opts.priority);
    }

    // Fill metadata (cost, category, functional role)
    await fillMetadataFields(page, addingRow, {
      cost: opts.cost,
      category: opts.category,
      functionalRole: opts.functionalRole,
    });

    // Commit
    const success = await commitRow(page, addingRow, opts.name);

    if (success) {
      logger.info(`Added: ${opts.name} (${typeToUse})`);
      return true;
    }

    // If Existing ingredient failed, retry with Processing
    if (typeToUse !== 'Processing' && (typeToUse === 'Existing ingredient' || typeToUse === 'Filler ingredient')) {
      logger.info({ name: opts.name }, 'Falling back to Processing type');
      // The row is still in addingRow mode — change type
      const fallbackSet = await setTypeOfVariable(page, 'Processing');
      if (fallbackSet) {
        const retrySuccess = await commitRow(page, page.locator('.addingRow').last(), opts.name);
        if (retrySuccess) {
          logger.info(`Added: ${opts.name} (Processing fallback)`);
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ name: opts.name, error: msg }, `Failed: ${opts.name}`);
    return false;
  }
}

// ── Change type in committed-row edit mode ─────────────────

async function changeTypeInEditMode(page: Page, rowLocator: ReturnType<Page['locator']>, typeName: string): Promise<boolean> {
  try {
    // Check if row has the type already
    const currentType = await rowLocator.locator('.select-input-type .ant-select-selection-item')
      .textContent({ timeout: 1000 }).catch(() => '');
    if (currentType === typeName) {
      return true; // already set
    }

    // Click the type dropdown selector — try .select-input-type first, then .name .ant-select
    let selector = rowLocator.locator('.select-input-type .ant-select-selector');
    let selectorVisible = await selector.isVisible({ timeout: 1500 }).catch(() => false);

    if (!selectorVisible) {
      // Fallback: the type select might be under .name column directly
      selector = rowLocator.locator('.name .ant-select-selector');
      selectorVisible = await selector.isVisible({ timeout: 1500 }).catch(() => false);
    }

    if (!selectorVisible) {
      logger.warn({ typeName, currentType }, 'Type selector not visible — cannot change type');
      return false;
    }

    await selector.click();
    await page.waitForTimeout(1000);

    // Find and click the option — try exact title match first, then hasText
    // Use .ant-select-dropdown to scope to visible dropdown
    const dropdown = page.locator('.ant-select-dropdown').last();
    const ddVisible = await dropdown.isVisible({ timeout: 2000 }).catch(() => false);
    if (!ddVisible) {
      logger.warn({ typeName, currentType }, 'Dropdown did not open');
      return false;
    }

    // Try clicking the option by its title attribute or exact text
    let option = dropdown.locator(`.ant-select-item-option[title="${typeName}"]`).first();
    let optionVisible = await option.isVisible({ timeout: 1000 }).catch(() => false);

    if (!optionVisible) {
      // Fallback: filter by hasText
      option = dropdown.locator('.ant-select-item-option').filter({ hasText: typeName }).first();
      optionVisible = await option.isVisible({ timeout: 1000 }).catch(() => false);
    }

    if (!optionVisible) {
      // Last resort: scroll down in dropdown and try again
      await dropdown.evaluate(el => el.scrollTop = 0);
      await page.waitForTimeout(300);
      option = dropdown.locator(`.ant-select-item-option[title="${typeName}"]`).first();
      optionVisible = await option.isVisible({ timeout: 1000 }).catch(() => false);
    }

    if (optionVisible) {
      await option.scrollIntoViewIfNeeded();
      await option.click();
      await page.waitForTimeout(400);
      logger.info({ from: currentType, to: typeName }, 'Type changed');
      return true;
    }

    // Debug: log what options ARE visible
    const visibleOpts = await dropdown.locator('.ant-select-item-option').allTextContents().catch(() => []);
    logger.warn({ typeName, currentType, visibleOptions: visibleOpts.slice(0, 10) }, 'Type option not found in dropdown');
    await page.keyboard.press('Escape');
    return false;
  } catch (err) {
    logger.warn({ typeName, error: (err as Error).message }, 'Type change error');
    return false;
  }
}

// ── Update an existing committed row ──────────────────────

/**
 * Click a committed row to enter edit mode, fill metadata, then save.
 * Clicking the .cost or .name column activates edit mode (adds .addingRow class).
 */
async function updateCommittedRow(
  page: Page,
  rowIndex: number,
  opts: {
    name: string;
    typeOfVariable?: string;
    cost?: number;
    category?: string;
    functionalRole?: string;
    priority?: string;
  },
): Promise<boolean> {
  try {
    // Click the cost column to enter edit mode
    const row = page.locator('.row-table').nth(rowIndex);
    const costCol = row.locator('.cost').first();

    if (await costCol.isVisible({ timeout: 2000 }).catch(() => false)) {
      await costCol.click();
      await page.waitForTimeout(1500);
    } else {
      // Fallback: click the name column
      const nameCol = row.locator('.name').first();
      if (await nameCol.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameCol.click();
        await page.waitForTimeout(1500);
      } else {
        logger.warn({ name: opts.name, rowIndex }, 'Cannot enter edit mode');
        return false;
      }
    }

    // Verify edit mode activated (row should now have .addingRow class)
    const isEditing = await page.evaluate((idx: number) => {
      const rows = document.querySelectorAll('.row-table');
      return rows[idx]?.classList.contains('addingRow') ?? false;
    }, rowIndex);

    if (!isEditing) {
      logger.warn({ name: opts.name, rowIndex }, 'Edit mode not activated');
      return false;
    }

    // Use the specific row by index (NOT .addingRow.last() which can match wrong row)
    const editRow = page.locator('.row-table').nth(rowIndex);

    // Set Type Of Variable directly (committed row edit mode)
    if (opts.typeOfVariable) {
      const typeChanged = await changeTypeInEditMode(page, editRow, opts.typeOfVariable);
      if (!typeChanged) {
        logger.warn({ name: opts.name, targetType: opts.typeOfVariable }, 'Type change failed');
        if (opts.typeOfVariable === 'Existing ingredient' || opts.typeOfVariable === 'Filler ingredient') {
          const fallback = await changeTypeInEditMode(page, editRow, 'Processing');
          if (!fallback) logger.warn({ name: opts.name }, 'Fallback to Processing also failed');
        }
      }
    }

    // Set priority if it's an outcome and not Low
    if (opts.priority && opts.priority !== 'Low') {
      await setPriority(page, opts.priority);
    }

    // Fill metadata
    await fillMetadataFields(page, editRow, {
      cost: opts.cost,
      category: opts.category,
      functionalRole: opts.functionalRole,
    });

    // Commit via checkmark
    const success = await commitRow(page, editRow, opts.name);

    if (success) {
      logger.info(`Updated: ${opts.name}`);
      // Wait for row to exit edit mode
      await page.waitForTimeout(500);
      return true;
    }

    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ name: opts.name, error: msg }, `Failed updating: ${opts.name}`);
    return false;
  }
}

// ── Get committed row data ────────────────────────────────

interface CommittedRowInfo {
  index: number;
  name: string;
  type: string;
  isHeader: boolean;
}

async function getCommittedRows(page: Page): Promise<CommittedRowInfo[]> {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('.row-table:not(.addingRow)');
    return Array.from(rows).map((row, idx) => {
      const nameCol = row.querySelector('.variable-name') as HTMLElement;
      const name = nameCol?.textContent?.trim() || '';
      const typeCol = row.querySelector('.name') as HTMLElement;
      const type = typeCol?.textContent?.trim() || '';
      const isHeader = name === 'Variable Name' || (row as HTMLElement).id === 'header';
      return { index: idx, name, type, isHeader };
    });
  });
}

// ── Navigate to Inputs & Outcomes step ────────────────────

type NavResult = 'add_new' | 'data_table' | 'csv_uploaded' | 'failed';

async function navigateToInputsOutcomes(page: Page, project: InnovationProject): Promise<NavResult> {
  for (let step = 0; step < 5; step++) {
    // Check if we're already on I&O with committed rows
    if (await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 2000 }).catch(() => false)) {
      return 'add_new';
    }

    // Check if committed rows exist (.row-table with data)
    const hasRows = await page.locator('.row-table').count().catch(() => 0);
    if (hasRows > 1) {
      // We're on I&O with existing data rows
      return 'add_new';
    }

    const hasDataTable = await page.locator('th, td').filter({ hasText: 'FormulationID' }).first()
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (hasDataTable) return 'data_table';

    // Check if we're on a later step — try clicking the I&O step in the stepper
    const ioStep = page.locator('.ant-steps-item').filter({ hasText: /input|outcome|I&O/i }).first();
    if (await ioStep.isVisible({ timeout: 1500 }).catch(() => false)) {
      const isActive = await ioStep.evaluate(el => el.classList.contains('ant-steps-item-active')).catch(() => false);
      if (!isActive) {
        logger.info({ project: project.name }, 'Clicking I&O step in stepper to navigate back');
        await ioStep.click();
        await page.waitForTimeout(3000);
        await dismissFloatingButton(page);
        continue;
      }
    }

    if (await page.locator('input[placeholder="Project Name"]').isVisible({ timeout: 1500 }).catch(() => false)) {
      const nextBtn = page.getByRole('button', { name: /next/i });
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const disabled = await nextBtn.isDisabled().catch(() => true);
        if (!disabled) {
          await nextBtn.click({ timeout: 10000 });
          await page.waitForTimeout(3000);
          await dismissFloatingButton(page);
          continue;
        }
      }
    }

    const noDataWrapper = page.locator('.ant-radio-wrapper').filter({ hasText: 'No Data' });
    if (await noDataWrapper.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await noDataWrapper.evaluate(el =>
        el.classList.contains('ant-radio-wrapper-disabled')
      ).catch(() => false);

      if (!isDisabled) {
        await noDataWrapper.click();
        await page.waitForTimeout(1000);
      }

      const nextBtn = page.getByRole('button', { name: /next/i });
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const btnDisabled = await nextBtn.isDisabled().catch(() => true);
        if (!btnDisabled) {
          await nextBtn.click({ timeout: 10000 });
          await page.waitForTimeout(3000);
          await dismissFloatingButton(page);
          continue;
        }
      }

      if (isDisabled) {
        logger.info({ project: project.name }, 'Uploading CSV to pass Upload Data step');
        const uploadRadio = page.locator('.ant-radio-wrapper').filter({ hasText: /upload your own data/i });
        if (await uploadRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
          await uploadRadio.click();
          await page.waitForTimeout(1000);
        }

        const csvPath = generateProjectCSV(project);
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.count() > 0) {
          await fileInput.first().setInputFiles(csvPath);
          logger.info('CSV uploaded');
          await page.waitForTimeout(5000);

          const nextBtn2 = page.getByRole('button', { name: /next/i });
          for (let wait = 0; wait < 8; wait++) {
            const stillDisabled = await nextBtn2.isDisabled().catch(() => true);
            if (!stillDisabled) {
              await nextBtn2.click({ timeout: 10000 });
              await page.waitForTimeout(3000);
              await dismissFloatingButton(page);
              return 'csv_uploaded';
            }
            await page.waitForTimeout(2000);
          }
        }
      }
    }

    break;
  }

  if (await page.getByRole('button', { name: /add new/i }).isVisible({ timeout: 3000 }).catch(() => false)) {
    return 'add_new';
  }
  // Check if committed rows exist
  const rowCount = await page.locator('.row-table').count().catch(() => 0);
  if (rowCount > 1) return 'add_new';

  const hasDataTable = await page.locator('th, td').filter({ hasText: 'FormulationID' }).first()
    .isVisible({ timeout: 2000 }).catch(() => false);
  if (hasDataTable) return 'data_table';

  return 'failed';
}

// ── Click Next button ─────────────────────────────────────

async function clickNextButton(page: Page): Promise<boolean> {
  const nextBtn = page.getByRole('button', { name: /next/i });
  if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const disabled = await nextBtn.isDisabled().catch(() => true);
    if (!disabled) {
      await nextBtn.click({ timeout: 10000 });
      await page.waitForTimeout(3000);
      logger.info('Clicked Next');
      return true;
    }
    logger.warn('Next button is disabled');
  } else {
    logger.warn('Next button not visible');
  }
  return false;
}

// ── Configure a single project (main logic) ───────────────

async function configureProject(
  page: Page,
  project: InnovationProject,
  ingredientLookup: Map<string, IngredientMeta>,
): Promise<{ updated: number; added: number; skipped: number; errors: string[]; nextClicked: boolean }> {
  const result = { updated: 0, added: 0, skipped: 0, errors: [] as string[], nextClicked: false };

  const navResult = await navigateToInputsOutcomes(page, project);

  if (navResult === 'failed') {
    result.errors.push('Could not navigate to Inputs & Outcomes step');
    return result;
  }

  // For CSV data_table view, we can't edit — just log and move on
  if (navResult === 'data_table') {
    logger.info({ project: project.name }, 'On data table view — rows may not be editable');
    // Try clicking Next to move past this view
    result.nextClicked = await clickNextButton(page);
    return result;
  }

  // Determine filler ingredient
  const fillerName = selectFillerIngredient(project, ingredientLookup);
  logger.info({ filler: fillerName, project: project.name }, 'Selected filler ingredient');

  // Build variable metadata map
  const allVarNames = [
    ...project.inputs.map(i => extractIngredientName(i.name)),
    ...project.outcomes.map(o => o.name),
  ];

  type VarMeta = { typeOfVariable: string; cost?: number; category?: string; functionalRole?: string; priority: string };
  const varMetaMap = new Map<string, VarMeta>();

  for (const input of project.inputs) {
    const name = extractIngredientName(input.name);
    const meta = ingredientLookup.get(name.toLowerCase());
    const isFiller = name === fillerName;

    let typeOfVariable: string;
    if (input.type === 'processing_condition') {
      typeOfVariable = 'Processing';
    } else if (isFiller) {
      typeOfVariable = 'Filler ingredient';
    } else {
      typeOfVariable = 'Existing ingredient';
    }

    const functionalRole = input.type === 'processing_condition'
      ? (PROCESSING_ROLES[name] || 'Processing parameter')
      : (meta?.description || `${meta?.category || 'Formulation'} ingredient`);

    varMetaMap.set(name, {
      typeOfVariable,
      cost: meta?.costPerKg,
      category: input.type === 'processing_condition' ? 'Processing' : meta?.category,
      functionalRole,
      priority: 'Low',
    });
  }

  for (const outcome of project.outcomes) {
    varMetaMap.set(outcome.name, {
      typeOfVariable: classifyOutcomeType(outcome.name),
      functionalRole: OUTCOME_ROLES[outcome.name] || 'Performance metric',
      category: classifyOutcomeType(outcome.name).replace(' outcome', ''),
      priority: priorityLabel(outcome.importance),
    });
  }

  // Check for existing committed rows
  const committedRows = await getCommittedRows(page);
  const dataRows = committedRows.filter(r => !r.isHeader);

  if (dataRows.length > 0) {
    logger.info({ count: dataRows.length, project: project.name }, 'Updating existing rows with metadata');

    // Update each committed row
    for (const row of dataRows) {
      let meta = varMetaMap.get(row.name);
      if (!meta) {
        // Try to auto-classify unmatched rows (e.g., COGS per unit from CSV import)
        const isOutcome = row.type.toLowerCase().includes('outcome');
        const outcomeRole = OUTCOME_ROLES[row.name];
        if (isOutcome || outcomeRole) {
          meta = {
            typeOfVariable: classifyOutcomeType(row.name),
            functionalRole: outcomeRole || 'Performance metric',
            category: classifyOutcomeType(row.name).replace(' outcome', ''),
            priority: 'Low',
          };
          logger.info({ name: row.name, autoType: meta.typeOfVariable }, 'Auto-classified unmatched outcome');
        } else {
          // Check ingredient lookup
          const ingMeta = ingredientLookup.get(row.name.toLowerCase());
          if (ingMeta) {
            meta = {
              typeOfVariable: 'Existing ingredient',
              cost: ingMeta.costPerKg,
              category: ingMeta.category,
              functionalRole: ingMeta.description,
              priority: 'Low',
            };
          } else {
            logger.warn({ name: row.name }, 'No metadata found for variable — skipping');
            result.skipped++;
            continue;
          }
        }
      }

      // Need to re-fetch rows each time since indices shift after editing
      const currentRows = await getCommittedRows(page);
      const currentRow = currentRows.find(r => r.name === row.name && !r.isHeader);
      if (!currentRow) {
        logger.warn({ name: row.name }, 'Row not found after re-fetch');
        result.skipped++;
        continue;
      }

      const success = await updateCommittedRow(page, currentRow.index, {
        name: row.name,
        typeOfVariable: meta.typeOfVariable,
        cost: meta.cost,
        category: meta.category,
        functionalRole: meta.functionalRole,
        priority: meta.priority,
      });

      if (success) result.updated++;
      else result.errors.push(`Failed updating: ${row.name}`);

      await page.waitForTimeout(500);
    }
  } else {
    // No existing rows — add all variables fresh
    logger.info({ project: project.name }, 'Adding all variables with metadata');

    for (const input of project.inputs) {
      const name = extractIngredientName(input.name);
      const meta = varMetaMap.get(name);
      if (!meta) continue;

      const success = await addVariableRow(page, {
        name,
        typeOfVariable: meta.typeOfVariable,
        lowerBound: input.range.min,
        upperBound: input.range.max,
        priority: meta.priority,
        unit: input.unit || '%',
        cost: meta.cost,
        category: meta.category,
        functionalRole: meta.functionalRole,
      });

      if (success) result.added++;
      else result.errors.push(`Failed adding: ${name}`);
    }

    for (const outcome of project.outcomes) {
      const meta = varMetaMap.get(outcome.name);
      if (!meta) continue;

      const lowerBound = outcome.targetValue != null
        ? (outcome.direction === 'minimize' ? 0 : outcome.targetValue * 0.5)
        : 0;
      const upperBound = outcome.targetValue != null
        ? (outcome.direction === 'maximize' ? outcome.targetValue * 1.5 : outcome.targetValue * 1.2)
        : 100;

      const success = await addVariableRow(page, {
        name: outcome.name,
        typeOfVariable: meta.typeOfVariable,
        lowerBound: Math.round(lowerBound * 100) / 100,
        upperBound: Math.round(upperBound * 100) / 100,
        priority: meta.priority,
        unit: outcome.unit,
        cost: undefined,
        category: meta.category,
        functionalRole: meta.functionalRole,
      });

      if (success) result.added++;
      else result.errors.push(`Failed adding: ${outcome.name}`);
    }
  }

  // Click Next after all rows configured
  await page.waitForTimeout(1000);
  result.nextClicked = await clickNextButton(page);

  return result;
}

// ── Find project in table ─────────────────────────────────

async function findAndClickProject(page: Page, project: InnovationProject): Promise<boolean> {
  const byName = page.locator('tr').filter({ hasText: project.name }).first();
  if (await byName.isVisible({ timeout: 3000 }).catch(() => false)) {
    await byName.click();
    return true;
  }

  const shortName = project.name.split(' ').slice(0, 3).join(' ');
  const byShort = page.locator('tr').filter({ hasText: shortName }).first();
  if (await byShort.isVisible({ timeout: 2000 }).catch(() => false)) {
    await byShort.click();
    return true;
  }

  if (project.baseSKU) {
    const bySku = page.locator('tr').filter({ hasText: project.baseSKU }).first();
    if (await bySku.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bySku.click();
      return true;
    }
  }

  return false;
}

// ── Main export ───────────────────────────────────────────

export async function configureProjects(
  page: Page,
  projects: InnovationProject[],
  baseUrl: string,
  ingredients?: Ingredient[],
): Promise<SetupResult> {
  const startTime = Date.now();
  const url = baseUrl || process.env.TURING_URL || 'https://app.turingsaas.com';

  // Build ingredient lookup from provided ingredients
  const ingredientLookup = ingredients ? buildIngredientLookup(ingredients) : new Map<string, IngredientMeta>();
  logger.info({ ingredientCount: ingredientLookup.size }, 'Ingredient lookup built');

  const result: SetupResult = {
    section: 'Project Configuration',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    screenshotPaths: [],
    durationMs: 0,
  };

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const progress = `${i + 1}/${projects.length}`;
    logger.info({ progress, name: project.name }, `=== Configuring: ${project.name} ===`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);

      await page.getByText('Projects', { exact: true }).first().click();
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);

      const found = await findAndClickProject(page, project);
      if (!found) {
        logger.warn({ name: project.name }, 'Project not found in table');
        result.errors.push(`${project.name}: Not found in projects table`);
        result.failed++;
        continue;
      }

      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);

      const configResult = await configureProject(page, project, ingredientLookup);
      result.created += configResult.updated + configResult.added;
      result.skipped += configResult.skipped;
      if (configResult.errors.length > 0) {
        result.errors.push(...configResult.errors.map(e => `${project.name}: ${e}`));
      }
      if (configResult.updated === 0 && configResult.added === 0 && configResult.skipped === 0) {
        result.failed++;
      }

      const ssPath = await screenshot(page, `config-${i + 1}-${project.name.slice(0, 20)}`);
      result.screenshotPaths.push(ssPath);
      logger.info({
        progress,
        updated: configResult.updated,
        added: configResult.added,
        skipped: configResult.skipped,
        nextClicked: configResult.nextClicked,
      }, `Done: ${project.name}`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ name: project.name, error: msg }, `Failed: ${project.name}`);
      result.errors.push(`${project.name}: ${msg}`);
      result.failed++;
    }
  }

  result.durationMs = Date.now() - startTime;
  logger.info(result, 'Project configuration complete');
  return result;
}
