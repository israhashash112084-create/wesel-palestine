import { prisma, query } from '#database/db.js';
import { distanceBetween } from '#shared/utils/geo.js';
import { toCountMap } from '#shared/utils/count-map.js';

const DUPLICATE_RADIUS_KM = 0.5; // 500m
const DUPLICATE_TIME_WINDOW_MS = 60 * 60 * 1000;
const USER_TIME_WINDOW_MS = 30 * 60 * 1000;

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
      checkpointId: true,
      proposedCheckpointStatus: true,
      locationLat: true,
      locationLng: true,
      confidenceScore: true,
      createdAt: true,
      duplicateOf: true,
      incidentId: true,
      area: true,
      road: true,
      city: true,
      user: this._userSelect(),
    };
  }

  _reportListSelect() {
    return {
      ...this._reportSelect(),
      description: true,
    };
  }

  _reportDetailSelect() {
    return {
      ...this._reportListSelect(),
      rejectReason: true,
      userId: true,
      checkpoint: {
        select: {
          id: true,
          name: true,
          area: true,
          city: true,
          road: true,
          status: true,
        },
      },
    };
  }

  async create(data) {
    return prisma.report.create({
      data: {
        userId: data.userId,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        area: data.area ?? null,
        road: data.road ?? null,
        city: data.city ?? null,
        type: data.type,
        severity: data.severity,
        description: data.description,
        checkpointId: data.checkpointId ?? null,
        proposedCheckpointStatus: data.proposedCheckpointStatus ?? null,
        duplicateOf: data.duplicateOf ?? null,
        incidentId: data.incidentId ?? null,
        status: data.status ?? undefined,
        rejectReason: data.rejectReason ?? null,
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

  async findByIncidentId(
    incidentId,
    { skip = 0, take = 10, sortBy = 'createdAt', sortOrder = 'desc', status, type } = {}
  ) {
    const where = { incidentId };

    if (status) where.status = status;
    if (type) where.type = type;

    const [reports, total] = await prisma.$transaction([
      prisma.report.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        select: {
          ...this._reportListSelect(),
          _count: {
            select: {
              votes: true,
            },
          },
        },
      }),
      prisma.report.count({ where }),
    ]);

    return {
      reports,
      total,
    };
  }

  async findMany({ status, type, area, skip, take, sortBy, sortOrder, includeDuplicates = false }) {
    const where = {};

    if (!includeDuplicates) {
      where.duplicateOf = null;
    }

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

    const cleanedReports = reports.map((report) =>
      Object.fromEntries(Object.entries(report).filter(([, value]) => value !== null))
    );

    return { reports: cleanedReports, total };
  }

  async findNearbyDuplicate({
    locationLat,
    locationLng,
    type,
    excludeId = null,
    checkpointId,
    proposedCheckpointStatus,
  }) {
    if (checkpointId && proposedCheckpointStatus) {
      const windowSeconds = this._msToSeconds(DUPLICATE_TIME_WINDOW_MS);

      const rows = await query(
        `
      SELECT id
      FROM reports
      WHERE checkpoint_id = $1
        AND proposed_checkpoint_status = $2
        AND type = $3
        AND status IN ('pending', 'verified')
        AND duplicate_of IS NULL
        AND created_at > NOW() - ($4 || ' seconds')::INTERVAL
        AND ($5::int IS NULL OR id != $5)
      ORDER BY created_at DESC
      LIMIT 1
      `,
        [checkpointId, proposedCheckpointStatus, type, windowSeconds, excludeId]
      );

      return rows.rows[0] ?? null;
    }

    const windowSeconds = this._msToSeconds(DUPLICATE_TIME_WINDOW_MS);

    const rows = await query(
      `
    SELECT id, location_lat, location_lng
    FROM reports
    WHERE type = $1
      AND status IN ('pending', 'verified')
      AND duplicate_of IS NULL
      AND created_at > NOW() - ($2 || ' seconds')::INTERVAL
      AND ($3::int IS NULL OR id != $3)
    `,
      [type, windowSeconds, excludeId]
    );

    return this._findNearest(rows.rows, locationLat, locationLng, DUPLICATE_RADIUS_KM);
  }

  async findUserDuplicateReport({
    userId,
    locationLat,
    locationLng,
    type,
    checkpointId,
    proposedCheckpointStatus,
  }) {
    if (checkpointId && proposedCheckpointStatus) {
      const windowSeconds = this._msToSeconds(USER_TIME_WINDOW_MS);

      const rows = await query(
        `
      SELECT id
      FROM reports
      WHERE user_id = $1
        AND type = $2
        AND checkpoint_id = $3
        AND proposed_checkpoint_status = $4
        AND status != 'rejected'
        AND created_at > NOW() - ($5 || ' seconds')::INTERVAL
      ORDER BY created_at DESC
      LIMIT 1
      `,
        [userId, type, checkpointId, proposedCheckpointStatus, windowSeconds]
      );

      return rows.rows[0] ?? null;
    }

    const windowSeconds = this._msToSeconds(USER_TIME_WINDOW_MS);

    const rows = await query(
      `
    SELECT id, location_lat, location_lng
    FROM reports
    WHERE user_id = $1
      AND type = $2
      AND status != 'rejected'
      AND created_at > NOW() - ($3 || ' seconds')::INTERVAL
    `,
      [userId, type, windowSeconds]
    );

    return this._findNearest(rows.rows, locationLat, locationLng, DUPLICATE_RADIUS_KM);
  }

  async findUserDuplicateForReport(reportId, userId) {
    return prisma.report.findFirst({
      where: { duplicateOf: reportId, userId },
      select: { id: true },
    });
  }

  async update(id, data) {
    return prisma.report.update({ where: { id }, data });
  }

  async updateMany(where, data) {
    return prisma.report.updateMany({ where, data });
  }

  async getModerationSnapshot(reportId) {
    const [primary, duplicates] = await prisma.$transaction([
      prisma.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          status: true,
          rejectReason: true,
          moderatedBy: true,
          moderatedAt: true,
        },
      }),
      prisma.report.findMany({
        where: { duplicateOf: reportId },
        select: {
          id: true,
          status: true,
          rejectReason: true,
          moderatedBy: true,
          moderatedAt: true,
        },
      }),
    ]);

    if (!primary) {
      return null;
    }

    return {
      primary,
      duplicates,
    };
  }

  async applyModerationOutcome(
    reportId,
    { status, rejectReason = null, moderatedBy = null, moderatedAt }
  ) {
    return prisma.$transaction(async (tx) => {
      const updatedPrimary = await tx.report.update({
        where: { id: reportId },
        data: {
          status,
          rejectReason,
          moderatedBy,
          moderatedAt,
        },
      });

      await tx.report.updateMany({
        where: { duplicateOf: reportId },
        data: {
          status,
          rejectReason,
          moderatedBy,
          moderatedAt,
        },
      });

      return updatedPrimary;
    });
  }

  async restoreModerationSnapshot(snapshot) {
    if (!snapshot?.primary) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: snapshot.primary.id },
        data: {
          status: snapshot.primary.status,
          rejectReason: snapshot.primary.rejectReason,
          moderatedBy: snapshot.primary.moderatedBy,
          moderatedAt: snapshot.primary.moderatedAt,
        },
      });

      for (const duplicate of snapshot.duplicates ?? []) {
        await tx.report.update({
          where: { id: duplicate.id },
          data: {
            status: duplicate.status,
            rejectReason: duplicate.rejectReason,
            moderatedBy: duplicate.moderatedBy,
            moderatedAt: duplicate.moderatedAt,
          },
        });
      }
    });
  }

  async incrementReportConfidenceScore(reportId, increment = 1) {
    const result = await prisma.report.update({
      where: { id: reportId },
      data: { confidenceScore: { increment } },
    });
    return result;
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

  async deleteAuditLogById(id) {
    return prisma.moderationAuditLog.delete({
      where: { id },
    });
  }

  async getUserStats(userId) {
    const [reportsByStatus, reportsByType, votesByValue, reportsSubmitted, votesCast] =
      await Promise.all([
        prisma.report.groupBy({
          by: ['status'],
          where: { userId },
          _count: { _all: true },
        }),
        prisma.report.groupBy({
          by: ['type'],
          where: { userId },
          _count: { _all: true },
        }),
        prisma.reportVote.groupBy({
          by: ['vote'],
          where: { userId },
          _count: { _all: true },
        }),
        prisma.report.count({ where: { userId } }),
        prisma.reportVote.count({ where: { userId } }),
      ]);

    return {
      counts: {
        reportsSubmitted,
        votesCast,
      },
      breakdowns: {
        reportsByStatus: toCountMap(reportsByStatus, 'status'),
        reportsByType: toCountMap(reportsByType, 'type'),
        votesByValue: toCountMap(votesByValue, 'vote'),
      },
    };
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
