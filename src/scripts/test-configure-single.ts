/**
 * Test: Configure a SINGLE project with full metadata.
 * Usage: npx tsx src/scripts/test-configure-single.ts [project-name]
 * Default: WBfF (Whitening Boost for Families — smallest project, 7+6 vars)
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

  const targetName = process.argv[2] || 'WBfF';

  // Load both categories
  const shConfig = await loadCategory('shampoo');
  const tpConfig = await loadCategory('toothpaste');

  const allProjects = [...shConfig.projects, ...tpConfig.projects];
  const allIngredients = [...shConfig.ingredients, ...tpConfig.ingredients];

  // Find the target project
  const project = allProjects.find(p =>
    p.name.toLowerCase().includes(targetName.toLowerCase()) ||
    p.baseSKU?.toLowerCase().includes(targetName.toLowerCase())
  );

  if (!project) {
    console.error(`Project not found: "${targetName}"`);
    console.log('Available:', allProjects.map(p => `${p.name} (${p.baseSKU || 'no sku'})`).join(', '));
    process.exit(1);
  }

  logger.info({
    name: project.name,
    inputs: project.inputs.length,
    outcomes: project.outcomes.length,
    ingredients: allIngredients.length,
  }, `Testing single project: ${project.name}`);

  const session = await launchBrowser({ headed: true, slowMo: 100 });

  try {
    await login(session.page, { url, email, password });

    const result = await configureProjects(session.page, [project], url, allIngredients);

    console.log('\n========= SINGLE PROJECT RESULT =========');
    console.log(`Project: ${project.name}`);
    console.log(`Configured (updated/added): ${result.created}`);
    console.log(`Skipped:  ${result.skipped}`);
    console.log(`Failed:   ${result.failed}`);
    console.log(`Errors:   ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
    console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log('==========================================\n');
  } finally {
    await closeBrowser(session);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
