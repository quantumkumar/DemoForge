import type { Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { screenshot } from '../automation/browser.js';

// ============================================================
// Types
// ============================================================

export interface ElementInfo {
  tag: string;
  role?: string;
  ariaLabel?: string;
  testId?: string;
  text: string;
  name?: string;
  type?: string;
  placeholder?: string;
  classes: string[];
  suggestedSelector: string;
}

export interface SectionDiscovery {
  name: string;
  url: string;
  screenshotPath: string;
  buttons: ElementInfo[];
  inputs: ElementInfo[];
  links: ElementInfo[];
  selects: ElementInfo[];
  forms: number;
}

export interface DiscoveryReport {
  timestamp: string;
  baseUrl: string;
  sections: SectionDiscovery[];
}

// ============================================================
// DOM Element Extraction (runs in page context)
// ============================================================

function extractElementsScript() {
  function getInfo(el: Element): Record<string, unknown> {
    const text = (el.textContent || '').trim().slice(0, 100);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '';
    const name = el.getAttribute('name') || '';
    const type = el.getAttribute('type') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const classes = Array.from(el.classList);

    // Generate suggested selector
    let suggestedSelector = '';
    if (testId) {
      suggestedSelector = `[data-testid="${testId}"]`;
    } else if (ariaLabel) {
      suggestedSelector = `[aria-label="${ariaLabel}"]`;
    } else if (role && text) {
      suggestedSelector = `role=${role}:has-text("${text.slice(0, 50)}")`;
    } else if (placeholder) {
      suggestedSelector = `[placeholder="${placeholder}"]`;
    } else if (name) {
      suggestedSelector = `[name="${name}"]`;
    } else if (text && tag === 'button') {
      suggestedSelector = `text="${text.slice(0, 50)}"`;
    }

    return { tag, role, ariaLabel, testId, text, name, type, placeholder, classes, suggestedSelector };
  }

  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).map(getInfo);
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea')).map(getInfo);
  const links = Array.from(document.querySelectorAll('a[href]')).map(getInfo);
  const selects = Array.from(document.querySelectorAll('select, [role="combobox"], [role="listbox"]')).map(getInfo);
  const forms = document.querySelectorAll('form').length;

  return { buttons, inputs, links, selects, forms };
}

// ============================================================
// Section Discovery
// ============================================================

async function discoverSection(
  page: Page,
  name: string,
  navAction: () => Promise<void>,
  screenshotDir: string,
): Promise<SectionDiscovery> {
  logger.info({ section: name }, `Discovering: ${name}`);

  try {
    await navAction();
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  } catch (err) {
    logger.warn({ section: name, error: String(err) }, `Navigation to ${name} failed`);
  }

  const screenshotPath = await screenshot(page, `discovery-${name}`);

  const elements = await page.evaluate(extractElementsScript);

  // Try clicking "Add" or "Create" buttons to discover forms
  const addButtons = elements.buttons.filter(
    (b) => /add|create|new/i.test(b.text as string) || /add|create|new/i.test((b.ariaLabel || '') as string),
  );

  let formScreenshotPath = '';
  if (addButtons.length > 0) {
    try {
      const btn = addButtons[0];
      const sel = (btn.suggestedSelector as string) || `text="${(btn.text as string).slice(0, 40)}"`;
      await page.locator(sel).first().click();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      formScreenshotPath = await screenshot(page, `discovery-${name}-form`);

      // Re-extract elements with form visible
      const formElements = await page.evaluate(extractElementsScript);
      elements.inputs = formElements.inputs;
      elements.selects = formElements.selects;
      elements.forms = formElements.forms;

      // Try to close the form
      const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]');
      if (await closeBtn.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      }
    } catch (err) {
      logger.debug({ section: name, error: String(err) }, 'Form discovery attempt failed');
    }
  }

  return {
    name,
    url: page.url(),
    screenshotPath: formScreenshotPath || screenshotPath,
    buttons: elements.buttons as ElementInfo[],
    inputs: elements.inputs as ElementInfo[],
    links: elements.links as ElementInfo[],
    selects: elements.selects as ElementInfo[],
    forms: elements.forms as number,
  };
}

// ============================================================
// Main Discovery Flow
// ============================================================

export async function discoverUI(page: Page): Promise<DiscoveryReport> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = join(process.env.SCREENSHOT_DIR || './screenshots', `discovery-${timestamp}`);
  mkdirSync(screenshotDir, { recursive: true });

  logger.info('Starting UI discovery');

  // 1. Dashboard overview
  await screenshot(page, 'discovery-dashboard');

  // 2. Extract all navigation elements
  const navElements = await page.evaluate(() => {
    const navLinks = Array.from(document.querySelectorAll('nav a, aside a, [role="navigation"] a, .sidebar a'));
    return navLinks.map((el) => ({
      text: (el.textContent || '').trim(),
      href: el.getAttribute('href') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      testId: el.getAttribute('data-testid') || '',
    }));
  });

  logger.info({ navCount: navElements.length }, 'Found navigation elements');
  for (const nav of navElements) {
    logger.info({ text: nav.text, href: nav.href }, '  Nav item');
  }

  // 3. Discover each major section
  const sections: SectionDiscovery[] = [];

  // Try to find and navigate to each section
  const sectionPatterns: Array<{ name: string; pattern: RegExp }> = [
    { name: 'ingredients', pattern: /ingredient|raw.?material|library/i },
    { name: 'recipes', pattern: /recipe|formulation|sku|product/i },
    { name: 'projects', pattern: /project|innovation|experiment|optimization/i },
    { name: 'datasets', pattern: /dataset|data|experiment/i },
  ];

  for (const { name, pattern } of sectionPatterns) {
    const matchingNav = navElements.find(
      (n) => pattern.test(n.text) || pattern.test(n.href),
    );

    if (matchingNav) {
      const section = await discoverSection(
        page,
        name,
        async () => {
          if (matchingNav.href && matchingNav.href !== '#') {
            const url = new URL(matchingNav.href, page.url()).href;
            await page.goto(url, { waitUntil: 'networkidle' });
          } else {
            await page.locator(`text="${matchingNav.text}"`).first().click();
          }
        },
        screenshotDir,
      );
      sections.push(section);
    } else {
      logger.warn({ section: name }, `Could not find navigation for "${name}" — skipping`);
    }
  }

  const report: DiscoveryReport = {
    timestamp,
    baseUrl: page.url(),
    sections,
  };

  // 4. Write report
  const reportsDir = './reports';
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `discovery-report-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  logger.info({ reportPath }, 'Discovery report saved');

  // 5. Print suggested selectors to console
  console.log('\n' + '='.repeat(60));
  console.log('SUGGESTED SELECTORS — paste into src/automation/selectors.ts');
  console.log('='.repeat(60));

  for (const section of sections) {
    console.log(`\n// ── ${section.name} ──`);
    console.log(`// URL: ${section.url}`);
    console.log(`// Buttons: ${section.buttons.length}, Inputs: ${section.inputs.length}, Forms: ${section.forms}`);
    console.log('// Buttons:');
    for (const btn of section.buttons.slice(0, 15)) {
      if (btn.suggestedSelector) {
        console.log(`//   "${btn.text}" → ${btn.suggestedSelector}`);
      }
    }
    console.log('// Inputs:');
    for (const inp of section.inputs.slice(0, 15)) {
      console.log(`//   [${inp.type || 'text'}] name="${inp.name}" placeholder="${inp.placeholder}" → ${inp.suggestedSelector}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  return report;
}
