import { prisma, query } from '#database/db.js';
import { distanceBetween } from '#shared/utils/geo.js';

const DUPLICATE_RADIUS_KM = 0.5; // 500m
const DUPLICATE_TIME_WINDOW_MS = 2 * 60 * 60 * 1000;
const USER_TIME_WINDOW_MS = 60 * 60 * 1000;

export class ReportsRepository {
  _userSelect() {
    return { select: { id: true, firstName: true, lastName: true } };
  }

  _reportSelect() {
    return {
      id: true,
      type: true,
      severity: true,
      status: true,
      locationLat: true,
      locationLng: true,
      confidenceScore: true,
      createdAt: true,
      user: this._userSelect(),
    };
  }

  _reportListSelect() {
    return {
      ...this._reportSelect(),
      area: true,
      description: true,
    };
  }

  _reportDetailSelect() {
    return {
      ...this._reportListSelect(),
      rejectReason: true,
      userId: true,
      duplicateOf: true,
      incidentId: true,
    };
  }

  async create(data) {
    return prisma.report.create({
      data: {
        userId: data.userId,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        area: data.area ?? null,
        type: data.type,
        severity: data.severity,
        description: data.description,
        duplicateOf: data.duplicateOf ?? null,
        incidentId: data.incidentId ?? null,
      },
      select: this._reportSelect(),
    });
  }

  async findById(id) {
    return prisma.report.findUnique({
      where: { id },
      select: this._reportDetailSelect(),
    });
  }

  async findMany({ status, type, area, skip, take, sortBy, sortOrder }) {
    const where = {
      duplicateOf: null,
    };
    if (status !== undefined) where.status = status;
    if (type) where.type = type;
    if (area) where.area = { contains: area, mode: 'insensitive' };
    const [reports, total] = await prisma.$transaction([
      prisma.report.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        select: this._reportListSelect(),
      }),
      prisma.report.count({ where }),
    ]);

    const cleanedReports = reports.map((report) => {
      const filteredReport = Object.fromEntries(
        // eslint-disable-next-line no-unused-vars
        Object.entries(report).filter(([key, value]) => value !== null)
      );
      return filteredReport;
    });

    return { reports: cleanedReports, total };
  }

  async findNearbyDuplicate({ locationLat, locationLng, type, excludeId = null }) {
    const windowSeconds = this._msToSeconds(DUPLICATE_TIME_WINDOW_MS);
    const rows = await query(
      `
      SELECT id, location_lat, location_lng, type, status
      FROM   reports
      WHERE  type            = $1
        AND  status          IN ('pending', 'verified')
        AND  duplicate_of    IS NULL
        AND  created_at      > NOW() - ($2 || ' seconds')::INTERVAL
        ${excludeId ? `AND id != ${excludeId}` : ''}
      `,
      [type, windowSeconds]
    );

    return this._findNearest(rows.rows, locationLat, locationLng, DUPLICATE_RADIUS_KM);
  }

  async findUserDuplicateReport({ userId, locationLat, locationLng, type }) {
    const windowSeconds = this._msToSeconds(USER_TIME_WINDOW_MS);
    const rows = await query(
      `
    SELECT id, type, status, location_lat, location_lng, created_at
    FROM   reports
    WHERE  user_id     = $1
      AND  type        = $2
      AND  status      != 'rejected'
      AND  created_at  > NOW() - ($3 || ' seconds')::INTERVAL
    `,
      [userId, type, windowSeconds]
    );

    return this._findNearest(rows.rows, locationLat, locationLng, DUPLICATE_RADIUS_KM);
  }

  async findUserDuplicateForReport(reportId, userId) {
    return prisma.report.findFirst({
      where: {
        duplicateOf: reportId,
        userId: userId,
      },
      select: { id: true },
    });
  }

  async update(id, data) {
    return prisma.report.update({
      where: { id },
      data,
    });
  }
  async updateMany(where, data) {
    return prisma.report.updateMany({
      where,
      data,
    });
  }

  async incrementReportConfidenceScore(reportId, increment = 1) {
    await prisma.report.update({
      where: { id: reportId },
      data: { confidenceScore: { increment } },
    });
  }

  async upsertVote(reportId, userId, vote) {
    const existing = await prisma.reportVote.findUnique({
      // eslint-disable-next-line camelcase
      where: { reportId_userId: { reportId, userId } },
    });

    await prisma.reportVote.upsert({
      // eslint-disable-next-line camelcase
      where: { reportId_userId: { reportId, userId } },
      create: { reportId, userId, vote },
      update: { vote },
    });

    return {
      isNew: !existing,
      previousVote: existing?.vote ?? null,
      currentVote: vote,
    };
  }

  async getVoteCounts(reportId) {
    const [upCount, downCount] = await prisma.$transaction([
      prisma.reportVote.count({ where: { reportId, vote: 'up' } }),
      prisma.reportVote.count({ where: { reportId, vote: 'down' } }),
    ]);
    return { upCount, downCount, total: upCount + downCount };
  }

  async adjustReportOwnersScore(reportId, amount) {
    const [original, duplicates] = await Promise.all([
      prisma.report.findUnique({ where: { id: reportId }, select: { userId: true } }),
      prisma.report.findMany({ where: { duplicateOf: reportId }, select: { userId: true } }),
    ]);

    const uniqueUserIds = [original?.userId, ...duplicates.map((d) => d.userId)].filter(Boolean);

    if (uniqueUserIds.length === 0) return;

    await prisma.user.updateMany({
      where: { id: { in: uniqueUserIds } },
      data: { confidenceScore: { increment: amount } },
    });
  }

  async increaseReportOwnersScore(reportId) {
    return this.adjustReportOwnersScore(reportId, 1);
  }
  async decreaseReportOwnersScore(reportId) {
    return this.adjustReportOwnersScore(reportId, -1);
  }

  async createAuditLog({ reportId, moderatorId, action, reason }) {
    return prisma.moderationAuditLog.create({
      data: { reportId, moderatorId: moderatorId ?? null, action, reason: reason ?? null },
    });
  }

  _findNearest(rows, lat, lng, radiusKm) {
    if (!rows || rows.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const row of rows) {
      const dist = distanceBetween(
        lat,
        lng,
        Number(row.location_lat ?? row.latitude),
        Number(row.location_lng ?? row.longitude)
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearest = row;
      }
    }

    return minDistance <= radiusKm ? nearest : null;
  }

  _msToSeconds(ms) {
    return ms / 1000;
  }
}
