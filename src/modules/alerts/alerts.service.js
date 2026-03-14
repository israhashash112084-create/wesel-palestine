import { BadRequestError, NotFoundError } from '#shared/utils/errors.js';

export class AlertsService {
  /**
   * @param {import('./alerts.repository.js').AlertsRepository} alertsRepository
   */
  constructor(alertsRepository) {
    this.alertsRepository = alertsRepository;
  }

  async createSubscription(userId, data) {
    const { areaLat, areaLng, radiusKm, incidentCategory } = data;

    return await this.alertsRepository.createSubscription({
      userId,
      areaLat,
      areaLng,
      radiusKm,
      incidentCategory,
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

    if (!result.count) {
      throw new BadRequestError('Alert not found or already updated');
    }

    return { message: 'Alert marked as read successfully' };
  }
}