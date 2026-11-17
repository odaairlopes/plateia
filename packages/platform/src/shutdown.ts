interface ShutdownLogger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/**
 * Graceful shutdown: on SIGINT/SIGTERM run the cleanup steps in order (stop
 * accepting work first, close connections last) and exit. A second signal or
 * a timeout forces the exit so a stuck step cannot hang a deploy.
 */
export function onShutdown(logger: ShutdownLogger, steps: Array<() => Promise<unknown>>, timeoutMs = 10_000): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const timer = setTimeout(() => process.exit(1), timeoutMs);
    timer.unref();
    try {
      for (const step of steps) await step();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
