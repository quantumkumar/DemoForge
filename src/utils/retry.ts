import type { Page } from 'playwright';
import { logger } from './logger.js';

export class SetupError extends Error {
  constructor(
    message: string,
    public readonly label: string,
    public readonly attemptErrors: Error[],
    public readonly screenshotPaths: string[],
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  label: string;
  page?: Page;
  refreshBetweenRetries?: boolean;
  screenshotDir?: string;
}

export async function withRetry<T>(
  action: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts = 3, label, page, refreshBetweenRetries = true } = options;
  const errors: Error[] = [];
  const screenshots: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push(error);
      logger.warn({ label, attempt, maxAttempts, error: error.message }, `Attempt ${attempt}/${maxAttempts} failed: ${label}`);

      if (attempt < maxAttempts && page && refreshBetweenRetries) {
        try {
          await page.reload();
          await page.waitForLoadState('networkidle', { timeout: 15_000 });
        } catch {
          logger.warn({ label }, 'Page refresh between retries failed');
        }
      }
    }
  }

  throw new SetupError(
    `Failed after ${maxAttempts} attempts: ${label}`,
    label,
    errors,
    screenshots,
  );
}
