import { prisma, query } from '#database/db.js';
import {
  DUPLICATE_DETECTION,
  USER_DUPLICATE_PREVENTION,
} from '#shared/constants/enums.js';

export class ReportsRepository {
  async create(data) {
  return prisma.report.create({
    data: {
      userId:      data.userId,
      locationLat: data.locationLat,
      locationLng: data.locationLng,
      area:        data.area ?? null,
      type:        data.type,
      description: data.description,
      duplicateOf: data.duplicateOf ?? null,
    },
    select: {
      id:              true,
      type:            true,
      status:          true,
      locationLat:     true,
      locationLng:     true,
      confidenceScore: true,
      createdAt:       true,
      user: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
}

  async findNearbyDuplicate({ locationLat, locationLng, type }) {
    const { RADIUS_METERS, TIME_WINDOW_MS } = DUPLICATE_DETECTION;

    return this.findNearestMatchingReport({
      selectClause: 'id,user_id, location_lat, location_lng, type, status',
      whereClause: `
        type = $1
        AND status IN ('pending', 'verified')
        AND duplicate_of IS NULL
        AND created_at > NOW() - ($2 || ' seconds')::INTERVAL
      `,
      params: [type, this.msToSeconds(TIME_WINDOW_MS), locationLat, locationLng],
      latParamIndex: 3,
      lngParamIndex: 4,
      radiusMeters: RADIUS_METERS,
    });
  }

  async findUserDuplicateReport({ userId, locationLat, locationLng, type }) {
    const { RADIUS_METERS, TIME_WINDOW_MS } = USER_DUPLICATE_PREVENTION;

    return this.findNearestMatchingReport({
      selectClause: 'id, type, status, created_at',
      whereClause: `
        user_id = $1
        AND type = $2
        AND status != 'rejected'
        AND created_at > NOW() - ($5 || ' seconds')::INTERVAL
      `,
      params: [userId, type, locationLat, locationLng, this.msToSeconds(TIME_WINDOW_MS)],
      latParamIndex: 3,
      lngParamIndex: 4,
      radiusMeters: RADIUS_METERS,
    });
  }

  async incrementReportConfidenceScore(reportId, increment = 1) {
    await prisma.report.update({
      where: { id: reportId },
      data: { confidenceScore: { increment } },
    });
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