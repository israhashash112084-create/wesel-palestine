import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';

import app from '#app.js';

const PORT = env.PORT;

app.listen(PORT, () => {
  logger.error('This is a test error log to verify logging functionality');
  logger.warn('This is a test warning log to verify logging functionality');
  logger.info(`Server running on port ${PORT}`);
  logger.debug('This is a test debug log to verify logging functionality');
  logger.http('This is a test http log to verify logging functionality');
});
