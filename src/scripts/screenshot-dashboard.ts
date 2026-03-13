/**
 * Quick screenshot of the dashboard on the current .env URL.
 */
import 'dotenv/config';
import { launchBrowser, closeBrowser, screenshot } from '../automation/browser.js';
import { login } from '../automation/login.js';

async function main() {
  const url = process.env.TURING_URL!;
  const email = process.env.TURING_EMAIL!;
  const password = process.env.TURING_PASSWORD!;

  const session = await launchBrowser({ headed: true, slowMo: 100 });
  try {
    await login(session.page, { url, email, password });
    await session.page.waitForTimeout(3000);
    await screenshot(session.page, 'new-tenant-dashboard');

    // Log all visible text elements that might be nav cards
    const cards = await session.page.evaluate(() => {
      const els = document.querySelectorAll('h2, h3, h4, [class*="card"] h2, [class*="card"] h3, [class*="Card"] span');
      return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
    });
    console.log('Dashboard headings:', cards);

    // Also check the URL after login
    console.log('Current URL:', session.page.url());
  } finally {
    await closeBrowser(session);
  }
}

main().catch(console.error);
