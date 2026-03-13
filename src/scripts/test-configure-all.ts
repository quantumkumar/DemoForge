/**
 * Test: Configure ALL projects across both categories (shampoo + toothpaste).
 * Expected behavior per project:
 *   SDS (Sulfate-Free Daily Shampoo): Already has CSV data → data_table → skip
 *   SRoF (SLS-Free Reformulation): Upload Data → CSV upload → data_table
 *   VEFT (Value Engineering): Upload Data → CSV upload → data_table
 *   CBGS (Clean Beauty Gen-Z Shampoo): I&O with 8 vars → skip
 *   AEB (Anti-Dandruff Efficacy Boost): I&O with 1+ vars → skip
 *   GPT (Gen-Z Probiotic): I&O → add_new or skip (has residual)
 *   WBfF (Whitening Boost): I&O → add_new or skip (has test vars)
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { configureProjects } from '../automation/project-configure.js';
import { loadCategory } from '../config/categories/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  // Load all projects
  const shConfig = await loadCategory('shampoo');
  const tpConfig = await loadCategory('toothpaste');

  const allProjects = [...shConfig.projects, ...tpConfig.projects];

  logger.info({
    total: allProjects.length,
    projects: allProjects.map(p => ({ name: p.name, inputs: p.inputs.length, outcomes: p.outcomes.length })),
  }, 'All projects loaded');

  const session = await launchBrowser({ headed: true, slowMo: 80 });

  try {
    await login(session.page, { url, email, password });

    const allIngredients = [...shConfig.ingredients, ...tpConfig.ingredients];
    const result = await configureProjects(session.page, allProjects, url, allIngredients);

    console.log('\n========= FINAL RESULTS =========');
    console.log(`Configured (updated/added): ${result.created}`);
    console.log(`Skipped:  ${result.skipped}`);
    console.log(`Failed:   ${result.failed}`);
    console.log(`Errors:   ${result.errors.length}`);
    console.log(`Ingredients in lookup: ${allIngredients.length}`);
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
    console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log('=================================\n');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
