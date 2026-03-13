import type { Page } from 'playwright';
import type { InnovationProject, SetupResult } from '../config/types.js';
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
 * Navigate to the Projects page from any page.
 */
async function goToProjectsPage(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);
  await dismissFloatingButton(page);

  // Click "Projects" or "Products" card on dashboard (varies by tenant)
  for (const label of ['Projects', 'Products']) {
    const card = page.getByText(label, { exact: true }).first();
    const found = await card.isVisible({ timeout: 3_000 }).catch(() => false);
    if (found) {
      await card.click();
      await page.waitForTimeout(3000);
      await dismissFloatingButton(page);
      return;
    }
  }

  // Fall back to direct URL
  await page.goto(`${baseUrl}/project`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);
  await dismissFloatingButton(page);
}

/**
 * Check if a project with the given name already exists.
 */
async function projectExists(page: Page, name: string): Promise<boolean> {
  try {
    const bodyText = await page.locator('body').textContent().catch(() => '') ?? '';
    return bodyText.toLowerCase().includes(name.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Detect which wizard type is available and click the create button.
 * Returns 'new-project' or 'create-product' depending on the tenant UI.
 */
async function clickCreateButton(page: Page): Promise<'new-project' | 'create-product'> {
  // Try "New Project" first (app.turingsaas.com style)
  const newProjectBtn = page.getByRole('button', { name: /new project/i });
  if (await newProjectBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await newProjectBtn.click();
    await page.waitForTimeout(2000);
    return 'new-project';
  }

  // Try "Create Product" (staging.turingsaas.com style)
  const createProductBtn = page.getByRole('button', { name: /create product/i });
  if (await createProductBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await createProductBtn.click();
    await page.waitForTimeout(2000);
    return 'create-product';
  }

  throw new Error('No create button found (tried "New Project" and "Create Product")');
}

/**
 * Map project type to the dropdown label used in Turing Labs.
 */
function projectTypeLabel(type: string): string {
  switch (type) {
    case 'new_audience': return 'Exploration';
    case 'performance_optimization': return 'Exploration';
    case 'cost_reduction': return 'Reduce Cost';
    case 'ingredient_substitution': return 'Preserve Label';
    default: return 'Exploration';
  }
}

/**
 * New Project wizard (app.turingsaas.com style).
 *
 * Sidebar steps: Start → Upload Data → Inputs & Outcomes → Competitor Definition → Unable to test outcomes
 *
 * Step 1 fields: Project Name, Product Name, Product Category, Project Objective, Project Type dropdown
 */
async function createViaNewProject(
  page: Page,
  project: InnovationProject,
  categoryName: string,
): Promise<void> {
  await page.waitForTimeout(1500);
  await dismissFloatingButton(page);

  // === Step 1: Project Info ===
  logger.info(`Step 1: Project Info — ${project.name}`);

  // Project Name (placeholder-based since no IDs)
  const projectNameInput = page.locator('input[placeholder="Project Name"]');
  await projectNameInput.waitFor({ state: 'visible', timeout: 10_000 });
  await projectNameInput.fill(project.name);

  // Product Name
  const productNameInput = page.locator('input[placeholder="Product Name"]');
  await productNameInput.fill(project.baseSKU || project.name);

  // Product Category
  const categoryInput = page.locator('input[placeholder="Product Category"]');
  await categoryInput.fill(categoryName);

  // Project Objective
  const objectiveInput = page.locator('textarea[placeholder="Project Objective"]');
  await objectiveInput.fill(project.description.slice(0, 500));

  // Project Type dropdown — select appropriate type
  const typeLabel = projectTypeLabel(project.type);
  const typeDropdown = page.locator('.ant-select').first();
  if (await typeDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
    await typeDropdown.click();
    await page.waitForTimeout(500);
    const option = page.locator('.ant-select-item-option').filter({ hasText: typeLabel }).first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(500);
    } else {
      // Click away to close dropdown
      await page.locator('body').click({ position: { x: 10, y: 10 } });
    }
  }

  await screenshot(page, `step1-${project.name.slice(0, 20)}`);

  // Click Save to create the project
  const saveBtn = page.getByRole('button', { name: /save/i });
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    logger.info(`Project saved: ${project.name}`);
    return;
  }

  // Alternatively click Next through remaining steps
  const nextBtn = page.getByRole('button', { name: /next/i });
  if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(2000);
  }

  // Steps 2-5: click through (no data to fill)
  for (let step = 2; step <= 5; step++) {
    logger.info(`Step ${step} — ${project.name}`);

    const next = page.getByRole('button', { name: /next/i });
    const save = page.getByRole('button', { name: /save/i });
    const complete = page.getByRole('button', { name: /complete|finish|done/i }).first();

    if (await complete.isVisible({ timeout: 2000 }).catch(() => false)) {
      await complete.click();
      await page.waitForTimeout(3000);
      return;
    }
    if (await save.isVisible({ timeout: 2000 }).catch(() => false)) {
      await save.click();
      await page.waitForTimeout(3000);
      return;
    }
    if (await next.isVisible({ timeout: 2000 }).catch(() => false)) {
      await next.click();
      await page.waitForTimeout(2000);
    }
  }
}

/**
 * Create Product wizard (staging.turingsaas.com style).
 *
 * Steps: Product Information (name, desc, "No Data") → Visualize → Classify → Configure Inputs → Configure Outputs → Complete
 */
async function createViaCreateProduct(
  page: Page,
  project: InnovationProject,
): Promise<void> {
  await page.waitForTimeout(1500);
  await dismissFloatingButton(page);

  // === Step 1: Product Information ===
  logger.info(`Step 1: Product Information — ${project.name}`);

  const nameInput = page.locator('#category');
  await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
  await nameInput.fill(project.name);

  const descInput = page.locator('#description');
  await descInput.fill(project.description.slice(0, 500));

  // Select "No Data" radio
  const noDataRadio = page.getByText('No Data', { exact: true });
  if (await noDataRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
    await noDataRadio.click();
    await page.waitForTimeout(500);
  }

  await screenshot(page, `step1-${project.name.slice(0, 20)}`);
  await page.getByRole('button', { name: /next/i }).click();
  await page.waitForTimeout(3000);

  // Steps 2-4: click Next
  for (let step = 2; step <= 4; step++) {
    logger.info(`Step ${step} — ${project.name}`);
    const nextBtn = page.getByRole('button', { name: /next/i });
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  // Step 5: Complete Setup
  logger.info(`Step 5 — ${project.name}`);
  const completeBtn = page.getByRole('button', { name: /complete setup/i });
  if (await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await completeBtn.click();
    await page.waitForTimeout(3000);
  } else {
    const finishBtn = page.getByRole('button', { name: /finish|done|submit|create/i }).first();
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click();
      await page.waitForTimeout(3000);
    }
  }
}

/**
 * Set up all projects in Turing Labs.
 * Automatically detects which wizard type the tenant uses.
 */
export async function setupProducts(
  page: Page,
  projects: InnovationProject[],
  baseUrl?: string,
  categoryName?: string,
): Promise<SetupResult> {
  const startTime = Date.now();
  const url = baseUrl || process.env.TURING_URL || 'https://app.turingsaas.com';
  const category = categoryName || 'Toothpaste';

  const result: SetupResult = {
    section: 'Projects',
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

    // Navigate to projects page
    await goToProjectsPage(page, url);

    // Idempotency check
    const exists = await projectExists(page, project.name);
    if (exists) {
      logger.info({ progress, name: project.name }, `Skipping (exists): ${project.name}`);
      result.skipped++;
      continue;
    }

    try {
      await dismissFloatingButton(page);

      // Detect wizard type
      const wizardType = await clickCreateButton(page);
      logger.info({ wizardType, project: project.name }, 'Using wizard');

      if (wizardType === 'new-project') {
        await createViaNewProject(page, project, category);
      } else {
        await createViaCreateProduct(page, project);
      }

      result.created++;
      logger.info({ progress, name: project.name }, `Created: ${project.name}`);

      const ssPath = await screenshot(page, `project-${i + 1}-complete`);
      result.screenshotPaths.push(ssPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ progress, name: project.name, error: msg }, `Failed: ${project.name}`);
      result.errors.push(`${project.name}: ${msg}`);
      result.failed++;

      // Recover: navigate back
      try {
        await goToProjectsPage(page, url);
      } catch {
        logger.error('Could not recover to Projects page — aborting remaining');
        break;
      }
    }
  }

  result.durationMs = Date.now() - startTime;
  logger.info(
    { created: result.created, skipped: result.skipped, failed: result.failed, durationMs: result.durationMs },
    'Project setup complete',
  );
  return result;
}
