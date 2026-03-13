import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
  level: process.env.LOG_LEVEL || 'info',
});

const timers = new Map<string, number>();

export function startTimer(label: string): void {
  timers.set(label, Date.now());
  logger.info({ section: label }, `Starting ${label}`);
}

export function endTimer(label: string): number {
  const start = timers.get(label);
  if (!start) return 0;
  const elapsed = Date.now() - start;
  timers.delete(label);
  logger.info({ section: label, durationMs: elapsed }, `Completed ${label} in ${(elapsed / 1000).toFixed(1)}s`);
  return elapsed;
}
