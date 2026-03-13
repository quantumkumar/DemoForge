/**
 * Full setup: Create no-data projects + upload SKU recipe datasets.
 *
 * Usage: npx tsx src/scripts/setup-all.ts [--category toothpaste|shampoo|all]
 *
 * 1. Creates projects (4 toothpaste + 3 shampoo) as Products with "No Data"
 * 2. Uploads SKU formulations (10 toothpaste + 8 shampoo) to Dataset Library
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { setupProducts } from '../automation/product-setup.js';
import { setupDatasets } from '../automation/dataset-setup.js';
import { loadCategory } from '../config/categories/index.js';
import { logger } from '../utils/logger.js';
import type { InnovationProject, SKU } from '../config/types.js';

async function main() {
  const categoryIdx = process.argv.indexOf('--category');
  const categoryName = categoryIdx >= 0 ? process.argv[categoryIdx + 1] : 'all';

  // Check what to run
  const skipProducts = process.argv.includes('--skip-products');
  const skipDatasets = process.argv.includes('--skip-datasets');

  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  if (!url || !email || !password) {
    console.error('Missing TURING_URL, TURING_EMAIL, or TURING_PASSWORD in .env');
    process.exit(1);
  }

  let allProjects: { project: InnovationProject; category: string }[] = [];
  let allSKUs: { skus: SKU[]; category: string }[] = [];

  if (categoryName === 'all' || categoryName === 'toothpaste') {
    const tpConfig = await loadCategory('toothpaste');
    allProjects = allProjects.concat(tpConfig.projects.map(p => ({ project: p, category: 'Toothpaste' })));
    allSKUs.push({ skus: tpConfig.skus, category: 'Toothpaste' });
    logger.info({ projects: tpConfig.projects.length, skus: tpConfig.skus.length }, 'Loaded toothpaste');
  }

  if (categoryName === 'all' || categoryName === 'shampoo') {
    const shConfig = await loadCategory('shampoo');
    allProjects = allProjects.concat(shConfig.projects.map(p => ({ project: p, category: 'Shampoo' })));
    allSKUs.push({ skus: shConfig.skus, category: 'Shampoo' });
    logger.info({ projects: shConfig.projects.length, skus: shConfig.skus.length }, 'Loaded shampoo');
  }

  const session = await launchBrowser({ headed: true, slowMo: 80 });

  try {
    await login(session.page, { url, email, password });

    // Phase 1: Create projects (per category, so the category name is passed correctly)
    if (!skipProducts) {
      // Group projects by category
      const byCategory = new Map<string, InnovationProject[]>();
      for (const { project, category } of allProjects) {
        const arr = byCategory.get(category) || [];
        arr.push(project);
        byCategory.set(category, arr);
      }

      for (const [category, projects] of byCategory) {
        logger.info({ count: projects.length, category }, `=== Phase 1: Creating ${category} projects ===`);
        const productResult = await setupProducts(session.page, projects, url, category);
        console.log(`\n${category} Projects — Created: ${productResult.created}, Skipped: ${productResult.skipped}, Failed: ${productResult.failed}`);
      }
    } else {
      logger.info('Skipping product creation (--skip-products)');
    }

    // Phase 2: Upload SKU recipe datasets
    if (!skipDatasets) {
      for (const { skus, category } of allSKUs) {
        logger.info({ count: skus.length, category }, `=== Phase 2: Uploading ${category} SKU datasets ===`);
        const datasetResult = await setupDatasets(session.page, skus, category, url);
        console.log(`\n${category} Datasets — Created: ${datasetResult.created}, Skipped: ${datasetResult.skipped}, Failed: ${datasetResult.failed}`);
      }
    } else {
      logger.info('Skipping dataset upload (--skip-datasets)');
    }

    console.log('\n=== All Setup Complete ===');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
