import { prisma } from '#database/db.js';

export class AlertsRepository {
  async createSubscription({ userId, areaLat, areaLng, radiusKm, category }) {
    return await prisma.alert_subscriptions.create({
      data: {
        user_id: userId,
        area_lat: areaLat,
        area_lng: areaLng,
        radius_km: radiusKm,
        category,
         updated_at: new Date(),
      },
    });
  }


  async findSubscriptionsByUserId(userId) {
  return await prisma.alert_subscriptions.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });
}

  async findActiveSubscriptionById(id, userId) {
  return await prisma.alert_subscriptions.findFirst({
    where: {
      id,
      user_id: userId,
      is_active: true,
    },
  });
}

 async updateSubscription(id, userId, data) {
  const mappedData = {};

  if (data.areaLat !== undefined) mappedData.area_lat = data.areaLat;
  if (data.areaLng !== undefined) mappedData.area_lng = data.areaLng;
  if (data.radiusKm !== undefined) mappedData.radius_km = data.radiusKm;
  if (data.category !== undefined) mappedData.category = data.category;
  if (data.isActive !== undefined) mappedData.is_active = data.isActive;

  mappedData.updated_at = new Date();

  return await prisma.alert_subscriptions.updateMany({
    where: { id, user_id: userId },
    data: mappedData,
  });
}

  async deactivateSubscription(id, userId) {
    return await prisma.alert_subscriptions.updateMany({
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