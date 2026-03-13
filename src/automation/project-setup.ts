import type { Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { InnovationProject, SetupResult } from '../config/types.js';
import { datasetToCSV } from '../data/projects.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { screenshot } from './browser.js';
import { navigateTo, waitForPageReady } from './navigation.js';
import { SELECTORS } from './selectors.js';

async function searchForProject(page: Page, name: string): Promise<boolean> {
  const sel = SELECTORS.projects;
  if (!sel.searchInput) return false;

  try {
    await page.locator(sel.searchInput).fill(name);
    await waitForPageReady(page);
    const found = await page.locator(`text="${name}"`).count();
    await page.locator(sel.searchInput).fill('');
    await waitForPageReady(page);
    return found > 0;
  } catch {
    return false;
  }
}

function writeCSVFile(project: InnovationProject): string {
  const dir = './reports/datasets';
  mkdirSync(dir, { recursive: true });
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.csv`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, datasetToCSV(project), 'utf-8');
  return filepath;
}

async function fillProjectForm(page: Page, project: InnovationProject): Promise<void> {
  const sel = SELECTORS.projects;

  // Metadata
  if (sel.nameInput) await page.locator(sel.nameInput).fill(project.name);
  if (sel.descriptionInput) await page.locator(sel.descriptionInput).fill(project.description);
  if (sel.typeSelect) {
    await page.locator(sel.typeSelect).selectOption({ value: project.type });
  }
  if (sel.baseSKUSelect && project.baseSKU) {
    await page.locator(sel.baseSKUSelect).selectOption({ label: project.baseSKU });
  }

  // Inputs
  for (const input of project.inputs) {
    if (sel.addInputButton) {
      await page.locator(sel.addInputButton).click();
      if (sel.inputNameInput) await page.locator(sel.inputNameInput).last().fill(input.name);
      if (sel.inputTypeSelect) await page.locator(sel.inputTypeSelect).last().selectOption({ value: input.type });
      if (sel.inputMinInput) await page.locator(sel.inputMinInput).last().fill(String(input.range.min));
      if (sel.inputMaxInput) await page.locator(sel.inputMaxInput).last().fill(String(input.range.max));
      if (sel.inputUnitInput && input.unit) await page.locator(sel.inputUnitInput).last().fill(input.unit);
    }
  }

  // Outcomes
  for (const outcome of project.outcomes) {
    if (sel.addOutcomeButton) {
      await page.locator(sel.addOutcomeButton).click();
      if (sel.outcomeNameInput) await page.locator(sel.outcomeNameInput).last().fill(outcome.name);
      if (sel.outcomeUnitInput) await page.locator(sel.outcomeUnitInput).last().fill(outcome.unit);
      if (sel.outcomeDirectionSelect) await page.locator(sel.outcomeDirectionSelect).last().selectOption({ value: outcome.direction });
      if (sel.outcomeTargetInput && outcome.targetValue != null) {
        await page.locator(sel.outcomeTargetInput).last().fill(String(outcome.targetValue));
      }
      if (sel.outcomeImportanceSelect) await page.locator(sel.outcomeImportanceSelect).last().selectOption({ value: outcome.importance });
    }
  }

  // Objectives
  for (const objective of project.objectives) {
    if (sel.addObjectiveButton) {
      await page.locator(sel.addObjectiveButton).click();
      if (sel.objectiveDescriptionInput) await page.locator(sel.objectiveDescriptionInput).last().fill(objective.description);
      if (sel.objectiveMetricSelect) await page.locator(sel.objectiveMetricSelect).last().selectOption({ label: objective.metric });
      if (sel.objectiveGoalSelect) await page.locator(sel.objectiveGoalSelect).last().selectOption({ value: objective.goal });
      if (sel.objectiveTargetInput && objective.targetValue != null) {
        await page.locator(sel.objectiveTargetInput).last().fill(String(objective.targetValue));
      }
      if (sel.objectivePriorityInput) await page.locator(sel.objectivePriorityInput).last().fill(String(objective.priority));
    }
  }

  // Constraints
  for (const constraint of project.constraints) {
    if (sel.addConstraintButton) {
      await page.locator(sel.addConstraintButton).click();
      if (sel.constraintDescriptionInput) await page.locator(sel.constraintDescriptionInput).last().fill(constraint.description);
      if (sel.constraintTypeSelect) await page.locator(sel.constraintTypeSelect).last().selectOption({ value: constraint.type });
      if (sel.constraintParameterInput) await page.locator(sel.constraintParameterInput).last().fill(constraint.parameter);
      if (sel.constraintOperatorSelect) await page.locator(sel.constraintOperatorSelect).last().selectOption({ value: constraint.operator });
      if (sel.constraintValueInput) {
        const val = Array.isArray(constraint.value) ? constraint.value.join(', ') : String(constraint.value);
        await page.locator(sel.constraintValueInput).last().fill(val);
      }
    }
  }

  // Dataset upload
  if (project.dataset.length > 0) {
    const csvPath = writeCSVFile(project);
    logger.info({ csvPath, rows: project.dataset.length }, `Dataset CSV written: ${csvPath}`);

    if (sel.uploadDatasetButton && sel.datasetFileInput) {
      await page.locator(sel.uploadDatasetButton).click();
      await page.locator(sel.datasetFileInput).setInputFiles(csvPath);
      await waitForPageReady(page);
    }
  }
}

export async function setupProjects(
  page: Page,
  projects: InnovationProject[],
): Promise<SetupResult> {
  const startTime = Date.now();
  const result: SetupResult = {
    section: 'Innovation Projects',
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    screenshotPaths: [],
    durationMs: 0,
  };

  await navigateTo(page, 'projects');
  const existing = new Set<string>();

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const progress = `${i + 1}/${projects.length}`;

    if (existing.has(project.name)) {
      logger.info({ progress, name: project.name }, `Skipping (exists): ${project.name}`);
      result.skipped++;
      continue;
    }

    const found = await searchForProject(page, project.name);
    if (found) {
      logger.info({ progress, name: project.name }, `Skipping (found): ${project.name}`);
      existing.add(project.name);
      result.skipped++;
      continue;
    }

    try {
      await withRetry(
        async () => {
          if (SELECTORS.projects.addButton) {
            await page.locator(SELECTORS.projects.addButton).click();
          } else {
            await page.getByRole('button', { name: /add|create|new/i }).first().click();
          }
          await waitForPageReady(page);

          await fillProjectForm(page, project);

          if (SELECTORS.projects.saveButton) {
            await page.locator(SELECTORS.projects.saveButton).click();
          } else {
            await page.getByRole('button', { name: /save|submit|create/i }).first().click();
          }
          await waitForPageReady(page);
        },
        { label: `Create project: ${project.name}`, page, maxAttempts: 3 },
      );

      const ssPath = await screenshot(page, `project-${project.type}-${project.name.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}`);
      result.screenshotPaths.push(ssPath);
      result.created++;
      existing.add(project.name);
      logger.info(
        { progress, name: project.name, type: project.type, datasetRows: project.dataset.length },
        `Created project ${progress}: ${project.name}`,
      );
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${project.name}: ${msg}`);
      logger.error({ progress, name: project.name, error: msg }, `Failed: ${project.name}`);
    }
  }

  result.durationMs = Date.now() - startTime;
  logger.info(
    { created: result.created, skipped: result.skipped, failed: result.failed },
    `Project setup complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`,
  );
  return result;
}
