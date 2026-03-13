import type { Page } from 'playwright';
import { logger } from '../utils/logger.js';
import { screenshot } from './browser.js';
import { withRetry } from '../utils/retry.js';

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

export async function login(
  page: Page,
  config: { url: string; email: string; password: string },
): Promise<void> {
  await withRetry(
    async () => {
      logger.info({ url: config.url }, 'Navigating to login page');
      await page.goto(config.url, { waitUntil: 'networkidle' });
      await screenshot(page, 'login-page').catch(() => {});

      // Try common login form patterns
      const emailInput =
        page.getByRole('textbox', { name: /email/i }) ||
        page.locator('input[type="email"]') ||
        page.locator('input[name="email"]');

      const passwordInput =
        page.getByRole('textbox', { name: /password/i }) ||
        page.locator('input[type="password"]') ||
        page.locator('input[name="password"]');

      await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
      await emailInput.fill(config.email);
      await passwordInput.fill(config.password);
      await screenshot(page, 'login-filled').catch(() => {});

      // Try common submit patterns
      const submitButton =
        page.getByRole('button', { name: /sign in|log in|login|submit|continue/i });
      await submitButton.click();

      // Wait for navigation away from login page
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      // Check for MFA prompt
      const mfaInput = page.locator('input[name*="otp"], input[name*="code"], input[name*="mfa"]');
      if (await mfaInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        logger.warn('MFA detected — pausing for manual entry. Complete MFA in the browser, then press Continue in the terminal.');
        await page.pause();
        await page.waitForLoadState('networkidle');
      }

      await screenshot(page, 'login-complete').catch(() => {});
      logger.info('Login successful');
    },
    { label: 'Login', page, maxAttempts: 2 },
  );
}
