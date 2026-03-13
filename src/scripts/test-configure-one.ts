/**
 * Test: Configure one project's Inputs & Outcomes.
 * Uses AEB (Anti-Dandruff Efficacy Boost) which is on Start step.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { configureProjects } from '../automation/project-configure.js';
import { loadCategory } from '../config/categories/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  // Load shampoo project: Sulfate-Free Daily Shampoo (SDS — currently on Start step, clean)
  const shConfig = await loadCategory('shampoo');
  const testProject = shConfig.projects[0]; // Sulfate-Free Daily Shampoo
  logger.info({
    name: testProject.name,
    inputs: testProject.inputs.length,
    outcomes: testProject.outcomes.length,
  }, 'Test project loaded');

  const session = await launchBrowser({ headed: true, slowMo: 80 });

  try {
    await login(session.page, { url, email, password });

    const result = await configureProjects(session.page, [testProject], url);

    logger.info(result, 'Configuration result');
    console.log(`\nResult: Added ${result.created}, Skipped ${result.skipped}, Failed ${result.failed}`);
    if (result.errors.length > 0) {
      console.log('Errors:', result.errors);
    }
  } finally {
    await closeBrowser(session);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
