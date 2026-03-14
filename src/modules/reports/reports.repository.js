import { prisma, query } from '#database/db.js';
const DUPLICATE_RADIUS_METERS = 500;
const DUPLICATE_TIME_WINDOW_MS = 2 * 60 * 60 * 1000;
const USER_TIME_WINDOW_MS = 60 * 60 * 1000;
const CHECKPOINT_RADIUS_METERS = 500;
export class ReportsRepository {
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
      },
      select: {
        id: true,
        type: true,
        severity: true,
        status: true,
        locationLat: true,
        locationLng: true,
        confidenceScore: true,
        createdAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async findNearbyDuplicate({ locationLat, locationLng, type, excludeId = null }) {
    const excludeClause = excludeId ? `AND id != ${excludeId}` : '';
    return this.findNearestMatchingReport({
      selectClause: 'id,user_id, location_lat, location_lng, type, status',
      whereClause: `
        type = $1
        AND status IN ('pending', 'verified')
        AND duplicate_of IS NULL
        AND created_at > NOW() - ($2 || ' seconds')::INTERVAL
        ${excludeClause}
      `,
      params: [type, this.msToSeconds(DUPLICATE_TIME_WINDOW_MS), locationLat, locationLng],
      latParamIndex: 3,
      lngParamIndex: 4,
      radiusMeters: DUPLICATE_RADIUS_METERS,
    });
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
  async findUserDuplicateReport({ userId, locationLat, locationLng, type }) {
    return this.findNearestMatchingReport({
      selectClause: 'id, type, status, created_at',
      whereClause: `
        user_id = $1
        AND type = $2
        AND status != 'rejected'
        AND created_at > NOW() - ($5 || ' seconds')::INTERVAL
      `,
      params: [userId, type, locationLat, locationLng, this.msToSeconds(USER_TIME_WINDOW_MS)],
      latParamIndex: 3,
      lngParamIndex: 4,
      radiusMeters: DUPLICATE_RADIUS_METERS,
    });
  }

  async incrementReportConfidenceScore(reportId, increment = 1) {
    await prisma.report.update({
      where: { id: reportId },
      data: { confidenceScore: { increment } },
    });
  }

  async findById(id) {
    const report = await prisma.report.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        severity: true,
        area: true,
        description: true,
        rejectReason: true,
        userId: true,
        locationLat: true,
        locationLng: true,
        confidenceScore: true,
        createdAt: true,
        duplicateOf: true,
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    // if (!report) return null;
    // const filteredReport = Object.fromEntries(
    //   Object.entries(report).filter(([key, value]) => value !== null)
    // );
    // return filteredReport;
    return report;
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
        orderBy: { [sortBy]: sortOrder }, skip,
        take,
        select: {
          id: true,
          type: true,
          severity: true,
          status: true,
          area: true,
          description: true,
          locationLat: true,
          locationLng: true,
          confidenceScore: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.report.count({ where }),
    ]);

    const cleanedReports = reports.map(report => {
      const filteredReport = Object.fromEntries(
        Object.entries(report).filter(([key, value]) => value !== null)
      );
      return filteredReport;
    });

    return { reports: cleanedReports, total };
  }

  async upsertVote(reportId, userId, vote) {
    const existing = await prisma.reportVote.findUnique({
      where: { reportId_userId: { reportId, userId } },
    });

    await prisma.reportVote.upsert({
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

  async update(id, data) {
    return prisma.report.update({
      where: { id },
      data,
    });
  }

  async getVoteCounts(reportId) {
    const [upCount, downCount] = await prisma.$transaction([
      prisma.reportVote.count({ where: { reportId, vote: 'up' } }),
      prisma.reportVote.count({ where: { reportId, vote: 'down' } }),
    ]);
    return { upCount, downCount, total: upCount + downCount };
  }

  async createAuditLog({ reportId, moderatorId, action, reason }) {
    return prisma.moderationAuditLog.create({
      data: { reportId, moderatorId: moderatorId ?? null, action, reason: reason ?? null },
    });
  }

  // async findNearestCheckpoint({ locationLat, locationLng }) {
  //   const result = await query(
  //     `
  //   SELECT id, name, status,
  //     (
  //       6371000 * acos(
  //         LEAST(1.0,
  //           cos(radians($1)) * cos(radians(latitude))
  //           * cos(radians(longitude) - radians($2))
  //           + sin(radians($1)) * sin(radians(latitude))
  //         )
  //       )
  //     ) AS distance_meters
  //   FROM checkpoints
  //   ORDER BY distance_meters ASC
  //   LIMIT 1
  //   `,
  //     [locationLat, locationLng]
  //   );
  //   return this.filterByDistance(result.rows[0], CHECKPOINT_RADIUS_METERS);
  // }

  async updateCheckpointStatus(checkpointId, newStatus) {
    return prisma.checkpoints.update({
      where: { id: checkpointId },
      data: { status: newStatus },
    });
  }

  async createIncident(data) {
    return prisma.incidents.create({
      data: {
        checkpointId: data.checkpointId ?? null,
        reportedBy: data.reportedBy ?? null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        area: data.area ?? null,
        type: data.type,
        severity: data.severity,
        description: data.description ?? null,
        status: 'verified',
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
  }
  async adjustReportOwnersScore(reportId, amount) {
    const original = await prisma.report.findUnique({
      where: { id: reportId },
      select: { userId: true },
    });

    const duplicates = await prisma.report.findMany({
      where: { duplicateOf: reportId },
      select: { userId: true },
    });

    const userIds = [
      original?.userId,
      ...duplicates.map(d => d.userId),
    ].filter(Boolean);

    const uniqueUserIds = [...new Set(userIds)];
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


  async findNearestMatchingReport({
    selectClause,
    whereClause,
    params,
    latParamIndex,
    lngParamIndex,
    radiusMeters,
  }) {
    const result = await query(
      `
      SELECT ${selectClause},
        (
          6371000 * acos(
            LEAST(1.0,
              cos(radians($${latParamIndex})) * cos(radians(location_lat))
              * cos(radians(location_lng) - radians($${lngParamIndex}))
              + sin(radians($${latParamIndex})) * sin(radians(location_lat))
            )
          )
        ) AS distance_meters
      FROM reports
      WHERE ${whereClause}
      ORDER BY distance_meters ASC
      LIMIT 1
      `,
      params
    );

    return this.filterByDistance(result.rows[0], radiusMeters);
  }

  filterByDistance(row, radiusMeters) {
    if (!row || Number(row.distance_meters) > radiusMeters) {
      return null;
    }

    return row;
  }

  msToSeconds(ms) {
    return ms / 1000;
  }

}