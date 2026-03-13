/**
 * Test adding a single real ingredient using the actual setupIngredients function.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser } from '../automation/browser.js';
import { login } from '../automation/login.js';
import { setupIngredients } from '../automation/ingredient-setup.js';
import type { Ingredient } from '../config/types.js';

const testIngredient: Ingredient = {
  name: 'Sodium Fluoride',
  inci: 'Sodium Fluoride',
  category: 'Fluoride Source',
  supplier: 'Solvay',
  costPerKg: 15.50,
  properties: { fluorideConcentration: 0.24, solubility: 4.2 },
  regulatoryNotes: 'FDA-approved cavity-protection agent.',
  description: 'Standard fluoride source for cavity protection in toothpaste formulations.',
};

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  const session = await launchBrowser({ headed: true, slowMo: 100 });

  try {
    await login(session.page, { url, email, password });
    const result = await setupIngredients(session.page, [testIngredient], url);

    console.log(`\nResult: created=${result.created}, skipped=${result.skipped}, failed=${result.failed}`);
    if (result.errors.length > 0) {
      console.log('Errors:', result.errors);
    }
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
