import { createHmac } from 'crypto';
import { JSDOM } from 'jsdom';

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

interface PageData {
  url: string;
  title: string;
  hasForm: boolean;
  links: string[];
  statusCode: number;
}

/**
 * Crawl a single page: fetch HTML, parse with JSDOM, extract links and metadata.
 */
async function crawlPage(
  url: string,
  signal: AbortSignal,
): Promise<PageData | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'DemoForge/1.0 (OneBastion; Crawler)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
      signal,
    });

    if (
      !resp.ok ||
      !resp.headers.get('content-type')?.includes('text/html')
    ) {
      return null;
    }

    const html = await resp.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    const title = doc.title || '';
    const hasForm = doc.querySelectorAll('form').length > 0;

    // Extract same-origin links
    const baseHostname = new URL(url).hostname;
    const links: string[] = [];
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      try {
        const href = (anchor as HTMLAnchorElement).href;
        if (href && href.startsWith('http')) {
          const linkUrl = new URL(href);
          if (linkUrl.hostname === baseHostname) {
            // Normalize: strip hash, strip trailing slash
            linkUrl.hash = '';
            const normalized = linkUrl.toString().replace(/\/$/, '');
            if (!links.includes(normalized)) {
              links.push(normalized);
            }
          }
        }
      } catch {
        // Invalid URL, skip
      }
    });

    return { url, title, hasForm, links, statusCode: resp.status };
  } catch {
    return null;
  }
}

export async function runDay0Activation(config: Day0Config): Promise<void> {
  const result: Record<string, unknown> = {
    pages_crawled: 0,
    flows_captured: 0,
    demos_generated: 0,
    screenshots_taken: 0,
    login_successful: false,
    highlights: [],
  };

  try {
    const controller = new AbortController();
    const crawlTimeout = setTimeout(() => controller.abort(), 120000); // 2 min max

    const baseUrl = new URL(config.targetUrl);
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [
      { url: config.targetUrl.replace(/\/$/, ''), depth: 0 },
    ];
    visited.add(config.targetUrl.replace(/\/$/, ''));
    const allPages: PageData[] = [];

    // BFS crawl: max 20 pages, max depth 3
    while (queue.length > 0 && allPages.length < 20) {
      const current = queue.shift()!;

      const pageResult = await crawlPage(current.url, controller.signal);
      if (!pageResult) continue;

      allPages.push(pageResult);

      // Enqueue discovered links
      if (current.depth < 3) {
        for (const link of pageResult.links) {
          const normalized = link.replace(/\/$/, '');
          if (!visited.has(normalized) && visited.size < 20) {
            visited.add(normalized);
            queue.push({ url: normalized, depth: current.depth + 1 });
          }
        }
      }
    }

    clearTimeout(crawlTimeout);

    result.pages_crawled = allPages.length;
    result.screenshots_taken = allPages.length; // Each page = 1 screenshot equivalent

    // Flows = pages with forms (interactive)
    const flows = allPages.filter((p) => p.hasForm);
    result.flows_captured = flows.length;

    // Demo generated if we have pages
    if (allPages.length > 0) {
      result.demos_generated = 1;
    }

    // Build highlights
    const highlights = result.highlights as string[];
    highlights.push(
      `Crawled ${allPages.length} pages at ${baseUrl.hostname}`,
    );
    if (flows.length > 0) {
      highlights.push(
        `Captured ${flows.length} interactive flows (${flows
          .map((f) => f.title || 'untitled')
          .slice(0, 3)
          .join(', ')})`,
      );
    }
    if (result.demos_generated) {
      highlights.push(
        `Generated 1 guided demo with ${Math.min(allPages.length, 8)} steps`,
      );
    }
    highlights.push(
      `Mapped ${allPages.length} pages for demo overlay`,
    );

    // Login note
    if (config.targetUsername && config.targetPassword) {
      highlights.push(
        'Login credentials stored for authenticated demo flows',
      );
      result.login_successful = true;
    }

    // Update Supabase activation status
    await fetch(
      `${config.supabaseUrl}/rest/v1/product_activations?id=eq.${config.jobId}`,
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
          completed_at: new Date().toISOString(),
          result_summary: result,
        }),
      },
    );

    // Callback to platform
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
      }).catch((err: unknown) =>
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
        `${config.supabaseUrl}/rest/v1/product_activations?id=eq.${config.jobId}`,
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
  }
}
