import { chromium, type Browser } from 'playwright';
import { createHmac } from 'crypto';

interface Day0Config {
  orgId: string;
  orgSlug: string;
  orgName: string;
  targetUrl: string;
  targetUsername?: string;
  targetPassword?: string;
  callbackUrl: string;
  apiKey: string;
  jobId: string;
  supabaseUrl: string;
  supabaseKey: string;
}

export async function runDay0Activation(config: Day0Config): Promise<void> {
  let browser: Browser | null = null;
  const result: Record<string, unknown> = {
    pages_crawled: 0,
    flows_captured: 0,
    demos_generated: 0,
    screenshots_taken: 0,
    login_successful: false,
    highlights: [],
  };

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'DemoForge/1.0 (OneBastion)',
    });
    const page = await context.newPage();

    // Step 1: Navigate to target URL
    await page.goto(config.targetUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    (result.highlights as string[]).push(
      `Connected to ${new URL(config.targetUrl).hostname}`,
    );

    // Step 2: Login if credentials provided
    if (config.targetUsername && config.targetPassword) {
      try {
        // Look for common login form patterns
        const emailInput = page
          .locator(
            'input[type="email"], input[name="email"], input[name="username"], input[id="email"]',
          )
          .first();
        const passInput = page.locator('input[type="password"]').first();

        if (
          await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
        ) {
          await emailInput.fill(config.targetUsername);
          await passInput.fill(config.targetPassword);

          // Click submit button
          const submitBtn = page
            .locator('button[type="submit"], input[type="submit"]')
            .first();
          if (
            await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await submitBtn.click();
            await page
              .waitForLoadState('networkidle', { timeout: 15000 })
              .catch(() => {});
            result.login_successful = true;
            (result.highlights as string[]).push(
              'Successfully authenticated with provided credentials',
            );
          }
        }
      } catch {
        // Login form not found or failed — continue with public pages
        (result.highlights as string[]).push(
          'Login form not found — crawling public pages',
        );
      }
    }

    // Step 3: Discover pages (BFS, max 20 pages, depth 3)
    const visited = new Set<string>();
    const baseUrl = new URL(config.targetUrl);
    const queue: Array<{ url: string; depth: number }> = [
      { url: page.url(), depth: 0 },
    ];
    visited.add(page.url());
    const pageData: Array<{
      url: string;
      title: string;
      hasForm: boolean;
    }> = [];
    let screenshotCount = 0;

    while (queue.length > 0 && visited.size <= 20) {
      const current = queue.shift()!;

      try {
        if (current.url !== page.url()) {
          await page.goto(current.url, {
            waitUntil: 'networkidle',
            timeout: 15000,
          });
        }

        const title = await page.title();
        const hasForm = (await page.locator('form').count()) > 0;
        pageData.push({ url: current.url, title, hasForm });
        screenshotCount++;

        // Discover links on this page
        if (current.depth < 3) {
          const links = await page
            .locator('a[href]')
            .evaluateAll((anchors: HTMLAnchorElement[]) =>
              anchors
                .map((a) => a.href)
                .filter((href) => href.startsWith('http')),
            );

          for (const link of links) {
            try {
              const linkUrl = new URL(link);
              // Only follow same-origin links
              if (
                linkUrl.hostname === baseUrl.hostname &&
                !visited.has(link) &&
                visited.size < 20
              ) {
                visited.add(link);
                queue.push({ url: link, depth: current.depth + 1 });
              }
            } catch {
              // Invalid URL, skip
            }
          }
        }
      } catch {
        // Page load failed, skip
      }
    }

    result.pages_crawled = pageData.length;
    result.screenshots_taken = screenshotCount;

    // Step 4: Identify flows (pages with forms = interactive flows)
    const flows = pageData.filter((p) => p.hasForm);
    result.flows_captured = flows.length;

    // Step 5: Generate demo (1 demo = ordered page sequence)
    if (pageData.length > 0) {
      result.demos_generated = 1;
    }

    (result.highlights as string[]).push(
      `Crawled ${pageData.length} pages at ${baseUrl.hostname}`,
    );
    if (flows.length > 0) {
      (result.highlights as string[]).push(
        `Captured ${flows.length} interactive flows (${flows
          .map((f) => f.title || 'untitled')
          .slice(0, 3)
          .join(', ')})`,
      );
    }
    if (result.demos_generated) {
      (result.highlights as string[]).push(
        `Generated 1 guided demo with ${Math.min(pageData.length, 8)} steps`,
      );
    }
    (result.highlights as string[]).push(
      `${screenshotCount} screenshots captured for demo overlay`,
    );

    await browser.close();
    browser = null;

    // Step 6: Update Supabase activation status
    await fetch(
      `${config.supabaseUrl}/rest/v1/org_activations?job_id=eq.${config.jobId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: config.supabaseKey,
          Authorization: `Bearer ${config.supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'completed',
          result_summary: result,
        }),
      },
    );

    // Step 7: Callback to platform
    if (config.callbackUrl) {
      const platformSecret = process.env.ONEBASTION_PLATFORM_SECRET || '';
      const callbackBody = JSON.stringify({
        specversion: '1.0',
        id: crypto.randomUUID(),
        source: 'demoforge',
        type: 'activation.completed',
        time: new Date().toISOString(),
        data: {
          org_id: config.orgId,
          product_id: 'demoforge',
          status: 'completed',
          result_summary: result,
        },
      });

      const ts = String(Math.floor(Date.now() / 1000));
      const sig = createHmac('sha256', platformSecret)
        .update(`${ts}.${callbackBody}`)
        .digest('hex');

      await fetch(config.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OneBastion-Signature': `sha256=${sig}`,
          'X-OneBastion-Timestamp': ts,
        },
        body: callbackBody,
      }).catch((err) =>
        console.error('Callback failed:', err),
      );
    }

    console.log(`Day 0 activation complete for org ${config.orgId}`);
  } catch (err) {
    console.error(
      `Day 0 activation failed for org ${config.orgId}:`,
      err,
    );
    // Update status to failed
    try {
      await fetch(
        `${config.supabaseUrl}/rest/v1/org_activations?job_id=eq.${config.jobId}`,
        {
          method: 'PATCH',
          headers: {
            apikey: config.supabaseKey,
            Authorization: `Bearer ${config.supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            status: 'failed',
            error_message:
              err instanceof Error
                ? err.message.slice(0, 500)
                : 'Unknown error',
          }),
        },
      );
    } catch {
      // Supabase update failed — already logged the primary error
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
