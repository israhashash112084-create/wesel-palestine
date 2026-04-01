import { BadRequestError, NotFoundError } from '#shared/utils/errors.js';

export class AlertsService {
  /**
   * @param {import('./alerts.repository.js').AlertsRepository} alertsRepository
   */
  constructor(alertsRepository) {
    this.alertsRepository = alertsRepository;
  }

  _mapIncidentTypeToCategory(type) {
    const supportedCategories = ['checkpoint', 'closure', 'delay', 'accident', 'weather_hazard'];

    if (supportedCategories.includes(type)) {
      return type;
    }

    return null;
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
    const incident = await this.alertsRepository.findIncidentById(incidentId);

    if (!incident) {
      return { skipped: true, reason: 'Incident not found', incidentId };
    }

    if (incident.status !== 'verified') {
      return { skipped: true, reason: 'Incident is not verified', incidentId };
    }

    const category = this._mapIncidentTypeToCategory(incident.type);

    if (!category) {
      return { skipped: true, reason: 'Incident category is not supported', incidentId };
    }

    const incidentLat = this._toNumber(incident.locationLat);
    const incidentLng = this._toNumber(incident.locationLng);

    if (incidentLat === null || incidentLng === null) {
      return { skipped: true, reason: 'Incident location is missing', incidentId };
    }

    const matchingSubscriptions = await this.alertsRepository.findMatchingSubscriptionsForIncident({
      category,
    });

    if (!matchingSubscriptions.length) {
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

    if (!subscriptionsInRadius.length) {
      return { skipped: true, reason: 'No subscriptions matched the radius', incidentId };
    }

    await Promise.all(
      subscriptionsInRadius.map((subscription) =>
        this.alertsRepository.createAlert({
          incidentId: incident.id,
          subscriptionId: subscription.id,
          status: 'pending',
        })
      )
    );

    return {
      success: true,
      incidentId,
      alertsCreated: subscriptionsInRadius.length,
    };
  }

  async handleNewIncident(incident) {
    return await this.processIncidentAlerts(incident.id);
  }
}