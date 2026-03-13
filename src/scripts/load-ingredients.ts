/**
 * Load all ingredients (toothpaste + shampoo) into Turing Labs.
 *
 * Usage: npx tsx src/scripts/load-ingredients.ts [--category toothpaste|shampoo|all]
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { setupIngredients } from '../automation/ingredient-setup.js';
import { loadCategory } from '../config/categories/index.js';
import { prepareIngredients } from '../data/ingredients.js';
import { logger } from '../utils/logger.js';
import type { Ingredient } from '../config/types.js';

async function main() {
  const categoryArg = process.argv.find(a => a === '--category');
  const categoryIdx = process.argv.indexOf('--category');
  const categoryName = categoryIdx >= 0 ? process.argv[categoryIdx + 1] : 'all';

  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  if (!url || !email || !password) {
    console.error('Missing TURING_URL, TURING_EMAIL, or TURING_PASSWORD in .env');
    process.exit(1);
  }

  // Collect ingredients from requested categories
  let allIngredients: Ingredient[] = [];

  if (categoryName === 'all' || categoryName === 'toothpaste') {
    const tpConfig = await loadCategory('toothpaste');
    const sorted = prepareIngredients(tpConfig);
    logger.info({ count: sorted.length }, 'Loaded toothpaste ingredients');
    allIngredients = allIngredients.concat(sorted);
  }

  if (categoryName === 'all' || categoryName === 'shampoo') {
    const shConfig = await loadCategory('shampoo');
    const sorted = prepareIngredients(shConfig);
    logger.info({ count: sorted.length }, 'Loaded shampoo ingredients');
    allIngredients = allIngredients.concat(sorted);
  }

  // Deduplicate by ingredient name (some ingredients may appear in both categories)
  const seen = new Set<string>();
  const deduped: Ingredient[] = [];
  for (const ing of allIngredients) {
    if (!seen.has(ing.name.toLowerCase())) {
      seen.add(ing.name.toLowerCase());
      deduped.push(ing);
    }
  }

  logger.info({ total: deduped.length, categories: categoryName }, 'Total unique ingredients to load');

  // Launch browser and login
  const session = await launchBrowser({ headed: true, slowMo: 50 });

  try {
    await login(session.page, { url, email, password });
    const result = await setupIngredients(session.page, deduped, url);

    console.log(`\n=== Ingredient Loading Complete ===`);
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
