import { prisma } from '#database/db.js';

export class AlertsRepository {
  async createSubscription({ userId, areaLat, areaLng, radiusKm, incidentCategory }) {
    return await prisma.alertSubscription.create({
      data: {
        userId,
        areaLat,
        areaLng,
        radiusKm,
        incidentCategory,
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
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAlertAsRead(id, userId) {
    return await prisma.alert.updateMany({
      where: { id, userId },
      data: {
        status: 'read',
        readAt: new Date(),
      },
    });
  }
}