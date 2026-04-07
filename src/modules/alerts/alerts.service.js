import { BadRequestError, NotFoundError } from '#shared/utils/errors.js';
import { addSendAlertJob } from '#modules/alerts/jobs/alerts.queue.js';
import {
  INCIDENT_STATUSES
} from '#shared/constants/enums.js';
export class AlertsService {
  /**
   * @param {import('./alerts.repository.js').AlertsRepository} alertsRepository
   */
  constructor(alertsRepository) {
    this.alertsRepository = alertsRepository;
  }

  async getUserStats(userId) {
    return await this.alertsRepository.getUserStats(userId);
  }

  _mapIncidentTypeToCategory(type) {
  const mapping = {
    delay: 'traffic',
    accident: 'accident',
    closure: 'closure',
  };

  return mapping[type] || null;
}

  _toNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'object' && typeof value.toNumber === 'function') {
      return value.toNumber();
    }

    return Number(value);
  }

  _calculateDistanceKm(lat1, lng1, lat2, lng2) {
    const toRadians = (degree) => (degree * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }

  async createSubscription(userId, data) {
    const { areaLat, areaLng, radiusKm, category } = data;

    return await this.alertsRepository.createSubscription({
      userId,
      areaLat,
      areaLng,
      radiusKm,
      category,
    });
  }

  async getUserSubscriptions(userId) {
    return await this.alertsRepository.findSubscriptionsByUserId(userId);
  }

  async updateSubscription(userId, subscriptionId, data) {
    const subscription = await this.alertsRepository.findActiveSubscriptionById(
      subscriptionId,
      userId
    );

    if (!subscription) {
      throw new NotFoundError('Alert subscription');
    }

    await this.alertsRepository.updateSubscription(subscriptionId, userId, data);

    return { message: 'Subscription updated successfully' };
  }

  async deactivateSubscription(userId, subscriptionId) {
    const subscription = await this.alertsRepository.findActiveSubscriptionById(
      subscriptionId,
      userId
    );

    if (!subscription) {
      throw new NotFoundError('Alert subscription');
    }

    await this.alertsRepository.deactivateSubscription(subscriptionId, userId);

    return { message: 'Subscription deactivated successfully' };
  }

  async getUserAlerts(userId) {
    return await this.alertsRepository.findAlertsByUserId(userId);
  }

  async markAlertAsRead(userId, alertId) {
    const result = await this.alertsRepository.markAlertAsRead(alertId, userId);

    if (!result || !result.count) {
      throw new BadRequestError('Alert not found or already updated');
    }

    return { message: 'Alert marked as read successfully' };
  }



  async processIncidentAlerts(incidentId) {
  console.log('processIncidentAlerts started for incident:', incidentId);

  const incident = await this.alertsRepository.findIncidentById(incidentId);
  console.log('incident found:', incident?.id, 'status:', incident?.status, 'type:', incident?.type);

  if (!incident) {
    console.log('skip: incident not found');
    return { skipped: true, reason: 'Incident not found', incidentId };
  }

  if (incident.status !== INCIDENT_STATUSES.VERIFIED) {
    console.log('skip: incident is not verified');
    return { skipped: true, reason: 'Incident is not verified', incidentId };
  }

  const category = this._mapIncidentTypeToCategory(incident.type);
  console.log('mapped category:', category);

  if (!category) {
    console.log('skip: incident category is not supported');
    return { skipped: true, reason: 'Incident category is not supported', incidentId };
  }

  const incidentLat = this._toNumber(incident.locationLat);
  const incidentLng = this._toNumber(incident.locationLng);
  console.log('incident coordinates:', incidentLat, incidentLng);

  if (incidentLat === null || incidentLng === null) {
    console.log('skip: incident location is missing');
    return { skipped: true, reason: 'Incident location is missing', incidentId };
  }

  const matchingSubscriptions = await this.alertsRepository.findMatchingSubscriptionsForIncident({
    category,
  });
  console.log('matching subscriptions by category:', matchingSubscriptions.length);

  if (!matchingSubscriptions.length) {
    console.log('skip: no matching subscriptions by category');
    return { skipped: true, reason: 'No matching subscriptions by category', incidentId };
  }

  const subscriptionsInRadius = matchingSubscriptions.filter((subscription) => {
    const subscriptionLat = this._toNumber(subscription.areaLat);
    const subscriptionLng = this._toNumber(subscription.areaLng);
    const radiusKm = this._toNumber(subscription.radiusKm);

    if (subscriptionLat === null || subscriptionLng === null || radiusKm === null) {
      return false;
    }

    const distanceKm = this._calculateDistanceKm(
      incidentLat,
      incidentLng,
      subscriptionLat,
      subscriptionLng
    );

    return distanceKm <= radiusKm;
  });

  console.log('subscriptions in radius:', subscriptionsInRadius.length);

  if (!subscriptionsInRadius.length) {
    console.log('skip: no subscriptions matched the radius');
    return { skipped: true, reason: 'No subscriptions matched the radius', incidentId };
  }

  const createdAlerts = await Promise.all(
    subscriptionsInRadius.map((subscription) =>
      this.alertsRepository.createAlert({
        incidentId: incident.id,
        subscriptionId: subscription.id,
        status: 'pending',
      })
    )
  );

  console.log('created alerts count:', createdAlerts.length);

  await Promise.all(
    createdAlerts.map((alert) => {
      console.log('Adding SEND_ALERT job for alert:', alert.id);
      return addSendAlertJob(alert.id);
    })
  );

  return {
    success: true,
    incidentId,
    alertsCreated: subscriptionsInRadius.length,
  };
}

    async sendAlert(alertId) {
  const alert = await this.alertsRepository.findAlertById(alertId);

  if (!alert) {
    return { skipped: true, reason: 'Alert not found', alertId };
  }

  if (alert.status !== 'pending') {
    return { skipped: true, reason: 'Alert already processed', alertId };
  }

  await this.alertsRepository.updateAlertStatus(alertId, {
    status: 'sent',
    sentAt: new Date(),
  });

  return {
    success: true,
    alertId,
    status: 'sent',
  };
}










async createReportStatusNotifications(report) {
  const recipients = [];

  const ownerId = report.userId ?? report.user?.id;

   if (ownerId) {
  recipients.push(ownerId);
    }

  const duplicates = await this.alertsRepository.findDuplicateReports(report.id);

  for (const duplicate of duplicates) {
    if (duplicate.userId && !recipients.includes(duplicate.userId)) {
      recipients.push(duplicate.userId);
    }
  }
console.log('recipients:', recipients);
  if (recipients.length === 0) {
    return { skipped: true, reason: 'No recipients found' };
  }

  const message =
    report.status === 'verified'
      ? `Your report #${report.id} has been approved.`
      : `Your report #${report.id} has been rejected.`;

  await Promise.all(
    recipients.map((userId) =>
      this.alertsRepository.createReportNotification({
        userId,
        reportId: report.id,
        message,
        status: 'pending',
      })
    )
  );

  return {
    success: true,
    notificationsCreated: recipients.length,
  };
}




  async handleNewIncident(incident) {
    return await this.processIncidentAlerts(incident.id);
  }
  
}
