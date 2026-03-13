import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SetupResult } from '../config/types.js';

export function generateReport(
  category: string,
  results: SetupResult[],
  reportsDir = './reports',
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const totalCreated = results.reduce((s, r) => s + r.created, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

  const lines: string[] = [
    `# Demo Setup Report — ${category} — ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Category | ${category} |`,
    `| Total Created | ${totalCreated} |`,
    `| Total Skipped | ${totalSkipped} |`,
    `| Total Failed | ${totalFailed} |`,
    `| Total Time | ${formatDuration(totalMs)} |`,
    '',
  ];

  for (const result of results) {
    lines.push(`## ${result.section}`);
    lines.push('');
    lines.push(`- Created: ${result.created}`);
    lines.push(`- Skipped: ${result.skipped}`);
    lines.push(`- Failed: ${result.failed}`);
    lines.push(`- Time: ${formatDuration(result.durationMs)}`);

    if (result.errors.length > 0) {
      lines.push('');
      lines.push('### Errors');
      for (const err of result.errors) {
        lines.push(`- ${err}`);
      }
    }

    if (result.screenshotPaths.length > 0) {
      lines.push('');
      lines.push('### Screenshots');
      for (const path of result.screenshotPaths) {
        lines.push(`- \`${path}\``);
      }
    }

    lines.push('');
  }

  const markdown = lines.join('\n');

  mkdirSync(reportsDir, { recursive: true });
  const filename = `setup-report-${category}-${timestamp}.md`;
  const filepath = join(reportsDir, filename);
  writeFileSync(filepath, markdown, 'utf-8');

  return filepath;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}
