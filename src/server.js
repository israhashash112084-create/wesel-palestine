import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';
import app from '#app.js';
import { startReportWorker, stopReportWorker } from '#modules/reports/jobs/report.worker.js';
import {
  startCheckpointWorker,
  stopCheckpointWorker,
} from '#modules/checkpoints/jobs/checkpoint.worker.js';
import {
  startIncidentWorker,
  stopIncidentWorker,
} from '#modules/incidents/jobs/incident.worker.js';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.error('This is a test error log to verify logging functionality');
  logger.warn('This is a test warning log to verify logging functionality');
  logger.info(`Server running on port ${PORT}`);
  logger.debug('This is a test debug log to verify logging functionality');
  logger.http('This is a test http log to verify logging functionality');
  startReportWorker();
  startCheckpointWorker();
  startIncidentWorker();
});
const shutdown = async (signal) => {
  logger.info(`${signal} received — starting graceful shutdown`);

  server.close(async () => {
    await stopReportWorker();
    await stopCheckpointWorker();
    await stopIncidentWorker();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Shutdown timed out after 30s — forcing exit');
    process.exit(1);
  }, 30_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
