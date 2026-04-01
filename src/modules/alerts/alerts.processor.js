import { ALERTS_JOB_NAMES } from '#modules/alerts/alerts.queue.js';
import { AlertsRepository } from '#modules/alerts/alerts.repository.js';
import { AlertsService } from '#modules/alerts/alerts.service.js';

const alertsRepository = new AlertsRepository();
const alertsService = new AlertsService(alertsRepository);

export const alertsProcessor = async (job) => {
  switch (job.name) {
    case ALERTS_JOB_NAMES.PROCESS_INCIDENT_ALERTS:
      return await alertsService.processIncidentAlerts(job.data.incidentId);

    default:
      throw new Error(`Unknown alerts job name: ${job.name}`);
  }
};