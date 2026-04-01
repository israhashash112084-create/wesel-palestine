import { prisma } from '#database/db.js';

export class AlertsRepository {
  async createSubscription({ userId, areaLat, areaLng, radiusKm, category }) {
    return await prisma.alertSubscription.create({
      data: {
        userId,
        areaLat,
        areaLng,
        radiusKm,
        category,
      },
    });
  }

  async findSubscriptionsByUserId(userId) {
    return await prisma.alertSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveSubscriptionById(id, userId) {
    return await prisma.alertSubscription.findFirst({
      where: {
        id,
        userId,
        isActive: true,
      },
    });
  }

  async updateSubscription(id, userId, data) {
    return await prisma.alertSubscription.updateMany({
      where: { id, userId },
      data,
    });
  }

  async deactivateSubscription(id, userId) {
    return await prisma.alertSubscription.updateMany({
      where: { id, userId },
      data: { isActive: false },
    });
  }

  async findAlertsByUserId(userId) {
    return await prisma.alert.findMany({
      where: {
        subscription: {
          userId,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: true,
        incident: true,
      },
    });
  }

  async markAlertAsRead(id, userId) {
    return await prisma.alert.updateMany({
      where: {
        id,
        subscription: {
          userId,
        },
      },
      data: {
        status: 'read',
      },
    });
  }

  async findIncidentById(id) {
    return await prisma.incident.findUnique({
      where: { id },
    });
  }

  async findMatchingSubscriptionsForIncident({ category }) {
    return await prisma.alertSubscription.findMany({
      where: {
        isActive: true,
        OR: [{ category }, { category: 'all' }],
      },
    });
  }

  async createAlert({ incidentId, subscriptionId, status = 'pending' }) {
    return await prisma.alert.create({
      data: {
        incidentId,
        subscriptionId,
        status,
      },
    });
  }
}