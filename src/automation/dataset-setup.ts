import type { Page } from 'playwright';
import type { SKU, SetupResult } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { screenshot } from './browser.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
 * Navigate to the Dataset Library from any page.
 */
async function goToDatasetLibrary(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);
  await dismissFloatingButton(page);

  const datasetCard = page.getByText('Dataset Library', { exact: false }).first();
  await datasetCard.waitFor({ state: 'visible', timeout: 15_000 });
  await datasetCard.click();
  await page.waitForTimeout(3000);
  await dismissFloatingButton(page);
}

/**
 * Check if a dataset with the given name already exists.
 */
async function datasetExists(page: Page, name: string): Promise<boolean> {
  try {
    const tableBody = page.locator('table tbody');
    if (await tableBody.isVisible({ timeout: 3000 }).catch(() => false)) {
      const bodyText = await tableBody.textContent().catch(() => '') ?? '';
      return bodyText.toLowerCase().includes(name.toLowerCase());
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sanitize a column name for Turing Labs CSV.
 * Allowed characters: a-z, A-Z, 0-9, spaces, hyphens, underscores.
 * Replace & with "and", remove periods and other special chars.
 */
function sanitizeColumnName(name: string): string {
  return name
    .replace(/&/g, 'and')
    .replace(/\./g, '')
    .replace(/[^a-zA-Z0-9 \-_]/g, '')
    .trim();
}

/**
 * Convert an SKU formulation into a recipe CSV.
 *
 * Turing Labs requires a specific CSV format with:
 *   - FormulationID: unique row identifier (e.g., "F001")
 *   - Type: row classification — "Benchmark", "Past formulation", "Competitive", etc.
 *   - Then ingredient, processing, and outcome columns with numeric values
 *
 * We generate:
 *   - Row 1 (base formulation): Type = "Benchmark"
 *   - Rows 2-6 (variations): Type = "Past formulation"
 */
function skuToCSV(sku: SKU, variationCount = 5): string {
  const ingredientNames = sku.formulation.map(f => sanitizeColumnName(f.ingredientName));
  const processingNames = sku.processingConditions.map(p => sanitizeColumnName(p.name));
  const outcomeNames = sku.outcomes.map(o => sanitizeColumnName(o.name));

  const headers = ['FormulationID', 'Type', ...ingredientNames, ...processingNames, ...outcomeNames];

  const rows: string[] = [];

  // Base formulation row — marked as Benchmark
  const baseRow = [
    `${sku.code}-001`,
    'Benchmark',
    ...sku.formulation.map(f => String(f.percentageW)),
    ...sku.processingConditions.map(p => String(p.value)),
    ...sku.outcomes.map(o => String(o.value)),
  ];
  rows.push(baseRow.join(','));

  // Generate variations (±5-15% noise on ingredients, recalculate proportions)
  for (let v = 0; v < variationCount; v++) {
    const seed = v * 7 + 13;
    const ingValues = sku.formulation.map((f, idx) => {
      const noise = 1 + ((Math.sin(seed + idx * 3.7) * 0.15));
      return Math.max(0, f.percentageW * noise);
    });

    // Normalize to 100%
    const sum = ingValues.reduce((a, b) => a + b, 0);
    const normalized = ingValues.map(v => (v / sum) * 100);

    const procValues = sku.processingConditions.map((p, idx) => {
      const noise = 1 + (Math.sin(seed + idx * 5.3) * 0.1);
      const val = p.value * noise;
      if (p.range) return Math.max(p.range.min, Math.min(p.range.max, val));
      return val;
    });

    const outcomeValues = sku.outcomes.map((o, idx) => {
      const noise = 1 + (Math.sin(seed + idx * 4.1) * 0.08);
      return o.value * noise;
    });

    const row = [
      `${sku.code}-${String(v + 2).padStart(3, '0')}`,
      'Past formulation',
      ...normalized.map(v => v.toFixed(4)),
      ...procValues.map(v => v.toFixed(2)),
      ...outcomeValues.map(v => v.toFixed(3)),
    ];
    rows.push(row.join(','));
  }

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Write a CSV file to the tmp directory.
 */
function writeCSVFile(csv: string, sku: SKU, index: number): string {
  const dir = join(process.cwd(), 'tmp');
  mkdirSync(dir, { recursive: true });
  const slug = sku.code.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const filename = `recipe-${index}-${slug}.csv`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, csv, 'utf-8');
  logger.debug({ filepath, sku: sku.code }, `Wrote CSV: ${filename}`);
  return filepath;
}

/**
 * Upload a single recipe dataset via the "Upload new recipe dataset" modal.
 *
 * Modal fields (discovered):
 *   - #basic_dataset_name         — Dataset name
 *   - #basic_dataset_description  — Description
 *   - #basic_dataset_product_category — Product category
 *   - input[accept=".csv"]        — File upload
 *   - Cancel / Create buttons
 */
async function uploadDataset(
  page: Page,
  sku: SKU,
  csvPath: string,
  categoryName: string,
): Promise<void> {
  // Click "Upload new recipe dataset"
  const uploadBtn = page.getByRole('button', { name: /upload new recipe dataset/i });
  await uploadBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await uploadBtn.click();
  await page.waitForTimeout(1500);

  // Wait for modal
  const modal = page.locator('.ant-modal').first();
  await modal.waitFor({ state: 'visible', timeout: 5_000 });

  // Fill name
  await page.locator('#basic_dataset_name').fill(`${sku.name} (${sku.code})`);

  // Fill description
  const desc = `${sku.positioningStatement}. Target: ${sku.targetDemographic}. Geo: ${sku.targetGeo}. COGS: $${sku.estimatedCOGS}/unit, Retail: $${sku.retailPrice}.`;
  await page.locator('#basic_dataset_description').fill(desc);

  // Fill product category
  await page.locator('#basic_dataset_product_category').fill(categoryName);

  // Upload CSV file
  const fileInput = page.locator('input[accept=".csv"]');
  await fileInput.setInputFiles(csvPath);
  await page.waitForTimeout(2000);

  await screenshot(page, `dataset-upload-${sku.code}`);

  // Check for CSV validation errors (toast/banner notifications) before clicking Create
  // Turing Labs shows errors like "Missing FormulationID or Type column" and
  // "Data file has no data rows" in notification banners above the modal
  await page.waitForTimeout(1500);
  const errorBannerSel = '.ant-message-error, .ant-message-notice-error, .ant-notification-notice-error, .ant-message .anticon-close-circle';
  const preErrors = await page.locator(errorBannerSel).allTextContents().catch(() => []);
  if (preErrors.length > 0) {
    logger.warn({ errors: preErrors }, 'CSV validation errors detected before Create');
    const cancelBtn = modal.getByRole('button', { name: /cancel/i });
    if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(500);
    }
    throw new Error(`CSV validation error: ${preErrors.join('; ')}`);
  }

  // Click "Create"
  const createBtn = modal.getByRole('button', { name: /create/i });
  await createBtn.click();

  // Wait for modal to close (indicates success) — CSV processing can take ~40-60s
  try {
    await modal.waitFor({ state: 'hidden', timeout: 90_000 });
    logger.debug(`Modal closed successfully for ${sku.code}`);
  } catch {
    // Modal still open — check for validation/toast errors
    const toastErrors = await page.locator('.ant-message-error, .ant-message-notice-error, .ant-notification-notice-error').allTextContents().catch(() => []);
    const formErrors = page.locator('.ant-form-item-explain-error');
    const errCount = await formErrors.count();

    const allErrors: string[] = [...toastErrors];
    for (let i = 0; i < errCount; i++) {
      const text = await formErrors.nth(i).textContent();
      if (text) allErrors.push(text.trim());
    }

    if (allErrors.length > 0) {
      const cancelBtn = modal.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }
      throw new Error(`Validation errors: ${allErrors.join('; ')}`);
    }

    // No errors detected but still open — try waiting more
    await page.waitForTimeout(5000);
    if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await screenshot(page, `dataset-modal-stuck-${sku.code}`);
      const cancelBtn = modal.getByRole('button', { name: /cancel|close/i }).first();
      if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }
      throw new Error('Modal did not close after create (90s timeout)');
    }
  }

  // After modal closes, the app may redirect to /project — wait for navigation
  await page.waitForTimeout(2000);
}

/**
 * Set up all SKU recipe datasets in the Dataset Library.
 */
export async function setupDatasets(
  page: Page,
  skus: SKU[],
  categoryName: string,
  baseUrl?: string,
): Promise<SetupResult> {
  const startTime = Date.now();
  const url = baseUrl || process.env.TURING_URL || 'https://staging.turingsaas.com';

  const result: SetupResult = {
    section: 'Dataset Library',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    screenshotPaths: [],
    durationMs: 0,
  };

  // Navigate to Dataset Library
  await goToDatasetLibrary(page, url);

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const progress = `${i + 1}/${skus.length}`;

    // Idempotency check
    const exists = await datasetExists(page, sku.code);
    if (exists) {
      logger.info({ progress, code: sku.code }, `Skipping (exists): ${sku.name}`);
      result.skipped++;
      continue;
    }

    try {
      // Generate CSV and write to file
      const csv = skuToCSV(sku);
      const csvPath = writeCSVFile(csv, sku, i);

      await dismissFloatingButton(page);
      await uploadDataset(page, sku, csvPath, categoryName);

      result.created++;
      logger.info({ progress, code: sku.code }, `Uploaded: ${sku.name}`);

      if (i === 0 || (i + 1) % 5 === 0 || i === skus.length - 1) {
        const ssPath = await screenshot(page, `dataset-${i + 1}`);
        result.screenshotPaths.push(ssPath);
      }

      // Re-navigate to Dataset Library (app redirects to /project after create)
      if (i < skus.length - 1) {
        await goToDatasetLibrary(page, url);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ progress, code: sku.code, error: msg }, `Failed: ${sku.name}`);
      result.errors.push(`${sku.name}: ${msg}`);
      result.failed++;

      // Recover: refresh Dataset Library
      try {
        await goToDatasetLibrary(page, url);
      } catch {
        logger.error('Could not recover to Dataset Library — aborting remaining');
        break;
      }
    }
  }

  result.durationMs = Date.now() - startTime;
  logger.info(
    { created: result.created, skipped: result.skipped, failed: result.failed, durationMs: result.durationMs },
    'Dataset setup complete',
  );
  return result;
}
