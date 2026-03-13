import 'dotenv/config';
import { Command } from 'commander';
import { loadCategory } from './config/categories/index.js';
import { validateIngredients } from './data/ingredients.js';
import { validateSKUs } from './data/skus.js';
import { generateProjectDatasets, validateProjects } from './data/projects.js';
import { launchBrowser, closeBrowser } from './automation/browser.js';
import { login } from './automation/login.js';
import { setupIngredients } from './automation/ingredient-setup.js';
import { setupRecipes } from './automation/recipe-setup.js';
import { setupProjects } from './automation/project-setup.js';
import { discoverUI } from './discovery/ui-inspector.js';
import { generateReport } from './utils/report.js';
import { logger, startTimer, endTimer } from './utils/logger.js';
import { prepareIngredients } from './data/ingredients.js';
import type { SetupResult } from './config/types.js';

const program = new Command()
  .name('turing-demo-setup')
  .description('Automated demo environment setup for Turing Labs R&D platform')
  .version('1.0.0');

// ── setup command ──────────────────────────────────────────

program
  .command('setup')
  .description('Set up demo environment with category data')
  .requiredOption('-c, --category <name>', 'Product category (e.g., toothpaste)')
  .option('--only <section>', 'Only run: ingredients | recipes | projects')
  .option('--headed', 'Run browser in headed mode', false)
  .option('--slow-mo <ms>', 'Slow down actions by ms', '0')
  .action(async (opts) => {
    startTimer('Total Setup');

    // Load and validate data
    logger.info({ category: opts.category }, 'Loading category config');
    const config = await loadCategory(opts.category);

    // Generate datasets
    const projects = generateProjectDatasets(config);
    config.projects = projects;

    // Validate
    const ingredientResult = validateIngredients(config.ingredients);
    const skuResult = validateSKUs(config);
    const projectResult = validateProjects(config.projects);

    if (!ingredientResult.valid || !skuResult.valid || !projectResult.valid) {
      const allErrors = [
        ...ingredientResult.errors,
        ...skuResult.errors,
        ...projectResult.errors,
      ];
      logger.error({ errors: allErrors }, 'Data validation failed');
      process.exit(1);
    }

    logger.info(
      {
        ingredients: ingredientResult.ingredientCount,
        skus: skuResult.skuCount,
        projects: projectResult.projectCount,
      },
      'Data validated successfully',
    );

    // Launch browser
    const session = await launchBrowser({
      headed: opts.headed,
      slowMo: parseInt(opts.slowMo, 10),
    });

    const results: SetupResult[] = [];

    try {
      // Login
      const url = process.env.TURING_URL;
      const email = process.env.TURING_EMAIL;
      const password = process.env.TURING_PASSWORD;

      if (!url || !email || !password) {
        throw new Error('Missing TURING_URL, TURING_EMAIL, or TURING_PASSWORD in .env');
      }

      await login(session.page, { url, email, password });

      const sections = opts.only ? [opts.only] : ['ingredients', 'recipes', 'projects'];

      for (const section of sections) {
        switch (section) {
          case 'ingredients': {
            startTimer('Ingredients');
            const sorted = prepareIngredients(config);
            const result = await setupIngredients(session.page, sorted);
            results.push(result);
            endTimer('Ingredients');
            break;
          }
          case 'recipes': {
            startTimer('Recipes');
            const result = await setupRecipes(session.page, config.skus);
            results.push(result);
            endTimer('Recipes');
            break;
          }
          case 'projects': {
            startTimer('Projects');
            const result = await setupProjects(session.page, config.projects);
            results.push(result);
            endTimer('Projects');
            break;
          }
          default:
            logger.warn({ section }, `Unknown section: ${section}`);
        }
      }

      // Generate report
      const reportPath = generateReport(opts.category, results);
      logger.info({ reportPath }, 'Setup report generated');
    } finally {
      await closeBrowser(session);
    }

    const totalMs = endTimer('Total Setup');

    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalFailed = results.reduce((s, r) => s + r.failed, 0);
    console.log(`\nSetup complete: ${totalCreated} items created, ${totalFailed} failures, ${(totalMs / 1000).toFixed(1)}s total`);

    if (totalFailed > 0) process.exit(1);
  });

// ── discover command ───────────────────────────────────────

program
  .command('discover')
  .description('Discover UI structure (screenshots + DOM inspection)')
  .option('--headed', 'Run in headed mode (recommended)', true)
  .option('--slow-mo <ms>', 'Slow down for visibility', '200')
  .action(async (opts) => {
    const url = process.env.TURING_URL;
    const email = process.env.TURING_EMAIL;
    const password = process.env.TURING_PASSWORD;

    if (!url || !email || !password) {
      console.error('Missing TURING_URL, TURING_EMAIL, or TURING_PASSWORD in .env');
      process.exit(1);
    }

    const session = await launchBrowser({
      headed: opts.headed,
      slowMo: parseInt(opts.slowMo, 10),
    });

    try {
      await login(session.page, { url, email, password });
      const report = await discoverUI(session.page);
      console.log(`\nDiscovery complete: ${report.sections.length} sections found`);
      console.log('Review screenshots and update src/automation/selectors.ts');
    } finally {
      await closeBrowser(session);
    }
  });

// ── validate command ───────────────────────────────────────

program
  .command('validate')
  .description('Validate category data (no browser needed)')
  .requiredOption('-c, --category <name>', 'Product category')
  .action(async (opts) => {
    const config = await loadCategory(opts.category);
    const projects = generateProjectDatasets(config);
    config.projects = projects;

    let hasErrors = false;

    // Ingredients
    const ingResult = validateIngredients(config.ingredients);
    console.log(`\nIngredients: ${ingResult.ingredientCount}`);
    if (!ingResult.valid) {
      hasErrors = true;
      for (const err of ingResult.errors) console.error(`  ✗ ${err}`);
    } else {
      console.log('  ✓ All valid');
    }

    // SKUs
    const skuResult = validateSKUs(config);
    console.log(`\nSKUs: ${skuResult.skuCount}`);
    for (const [code, sum] of Object.entries(skuResult.formulationSums)) {
      const ok = Math.abs(sum - 100) <= 0.01;
      console.log(`  ${ok ? '✓' : '✗'} ${code}: ${sum.toFixed(4)}%`);
    }
    if (!skuResult.valid) {
      hasErrors = true;
      for (const err of skuResult.errors) console.error(`  ✗ ${err}`);
    }

    // Projects
    const projResult = validateProjects(config.projects);
    console.log(`\nProjects: ${projResult.projectCount}`);
    for (const [name, count] of Object.entries(projResult.rowCounts)) {
      console.log(`  ${name}: ${count} rows`);
    }
    if (!projResult.valid) {
      hasErrors = true;
      for (const err of projResult.errors) console.error(`  ✗ ${err}`);
    }

    console.log(hasErrors ? '\n✗ Validation failed' : '\n✓ All data valid');
    if (hasErrors) process.exit(1);
  });

// ── cleanup command ────────────────────────────────────────

program
  .command('cleanup')
  .description('Remove demo data from environment (placeholder)')
  .requiredOption('-c, --category <name>', 'Product category')
  .action(async () => {
    console.log('Cleanup is not yet implemented. Remove demo data manually or use the platform UI.');
  });

program.parse();
