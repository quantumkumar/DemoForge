/**
 * Create all products (innovation projects) in Turing Labs with "No Data".
 *
 * Usage: npx tsx src/scripts/create-products.ts [--category toothpaste|shampoo|all]
 *
 * Each project becomes a "Product" in Turing Labs via the 5-step wizard,
 * created without historical data (the "No Data" option).
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { setupProducts } from '../automation/product-setup.js';
import { loadCategory } from '../config/categories/index.js';
import { logger } from '../utils/logger.js';
import type { InnovationProject } from '../config/types.js';

async function main() {
  const categoryIdx = process.argv.indexOf('--category');
  const categoryName = categoryIdx >= 0 ? process.argv[categoryIdx + 1] : 'all';

  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  if (!url || !email || !password) {
    console.error('Missing TURING_URL, TURING_EMAIL, or TURING_PASSWORD in .env');
    process.exit(1);
  }

  // Collect projects from requested categories (no dataset generation needed)
  let allProjects: InnovationProject[] = [];

  if (categoryName === 'all' || categoryName === 'toothpaste') {
    const tpConfig = await loadCategory('toothpaste');
    logger.info({ count: tpConfig.projects.length }, 'Loaded toothpaste projects');
    allProjects = allProjects.concat(tpConfig.projects);
  }

  if (categoryName === 'all' || categoryName === 'shampoo') {
    const shConfig = await loadCategory('shampoo');
    logger.info({ count: shConfig.projects.length }, 'Loaded shampoo projects');
    allProjects = allProjects.concat(shConfig.projects);
  }

  logger.info({ total: allProjects.length, categories: categoryName }, 'Total projects to create (No Data)');
  for (const proj of allProjects) {
    logger.info({ name: proj.name, type: proj.type, inputs: proj.inputs.length, outputs: proj.outcomes.length },
      `  ${proj.name}`);
  }

  // Launch browser and login
  const session = await launchBrowser({ headed: true, slowMo: 80 });

  try {
    await login(session.page, { url, email, password });
    const result = await setupProducts(session.page, allProjects, url);

    console.log(`\n=== Product Creation Complete ===`);
    console.log(`Created: ${result.created}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log(`Failed:  ${result.failed}`);
    console.log(`Time:    ${(result.durationMs / 1000).toFixed(1)}s`);

    if (result.errors.length > 0) {
      console.log(`\nErrors:`);
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }

    if (result.failed > 0) process.exit(1);
  } finally {
    await closeBrowser(session);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
