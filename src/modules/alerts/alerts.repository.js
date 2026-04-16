/* eslint-disable camelcase */
/* eslint-disable no-undef */
/* eslint-disable no-unreachable */
import { prisma } from '#database/db.js';
import { toCountMap } from '#shared/utils/count-map.js';
import { ALERT_STATUSES } from '#shared/constants/enums.js';

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
    const mappedData = {};
    if (data.areaLat !== undefined) mappedData.areaLat = data.areaLat;
    if (data.areaLng !== undefined) mappedData.areaLng = data.areaLng;
    if (data.radiusKm !== undefined) mappedData.radiusKm = data.radiusKm;
    if (data.category !== undefined) mappedData.category = data.category;
    if (data.isActive !== undefined) mappedData.isActive = data.isActive;

    return await prisma.alertSubscription.updateMany({
      where: { id, userId },
      data: mappedData,
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
        status: ALERT_STATUSES.READ,
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

  async createAlert({ incidentId, subscriptionId, status = ALERT_STATUSES.PENDING }) {
    return await prisma.alert.upsert({
      where: {
        incidentId_subscriptionId: {
          incidentId,
          subscriptionId,
        },
      },
      update: {},
      create: {
        incidentId,
        subscriptionId,
        status,
      },
    });
  }

  async findDuplicateReports(reportId) {
    return await prisma.report.findMany({
      where: { duplicateOf: reportId },
      select: {
        id: true,
        userId: true,
      },
    });
  }

  async createReportNotification({ userId, reportId, message, status = 'pending' }) {
    console.log('createReportNotification input:', {
      userId,
      reportId,
      message,
      status,
    });

    const created = await prisma.reportNotification.create({
      data: {
        userId,
        reportId,
        message,
        status,
      },
    });

    console.log('created report notification:', created);
    return created;
  }

  async findAlertById(alertId) {
    return await prisma.alert.findUnique({
      where: { id: alertId },
    });
  }

  async updateAlertStatus(alertId, data) {
    return await prisma.alert.update({
      where: { id: alertId },
      data,
    });
    console.log('created report notification:', created);
    return created;
  }
  async getUserStats(userId) {
    const [activeSubscriptionsByCategory, activeSubscriptions, inactiveSubscriptions] =
      await Promise.all([
        prisma.alertSubscription.groupBy({
          by: ['category'],
          where: { userId, isActive: true },
          _count: { _all: true },
        }),
        prisma.alertSubscription.count({
          where: { userId, isActive: true },
        }),
        prisma.alertSubscription.count({
          where: { userId, isActive: false },
        }),
      ]);

    return {
      counts: {
        activeSubscriptions,
        inactiveSubscriptions,
      },
      breakdowns: {
        activeSubscriptionsByCategory: toCountMap(activeSubscriptionsByCategory, 'category'),
      },
    };
  }
}
