import { prisma, prismaTransaction, query } from '#database/db.js';
import { Prisma } from '@prisma/client';
import { getBoundingBoxByRadiusMeters } from '#shared/utils/geo.js';

const CHECKPOINT_REPO_ERROR_CODES = {
  NOT_FOUND: 'CHECKPOINT_REPO_NOT_FOUND',
  CONCURRENT_STATUS_CONFLICT: 'CHECKPOINT_REPO_CONCURRENT_STATUS_CONFLICT',
  DUPLICATE_LOCATION_CONFLICT: 'CHECKPOINT_REPO_DUPLICATE_LOCATION_CONFLICT',
};

const buildRepoError = (code, message, details = {}) => {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
};

export class CheckpointsRepository {
  _baseSelect() {
    return {
      id: true,
      name: true,
      area: true,
      road: true,
      city: true,
      description: true,
      latitude: true,
      longitude: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  _buildWhere({ status, search, minLat, maxLat, minLng, maxLng }) {
    const where = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          area: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          road: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          city: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (minLat !== undefined || maxLat !== undefined) {
      where.latitude = {};

      if (minLat !== undefined) {
        where.latitude.gte = minLat;
      }

      if (maxLat !== undefined) {
        where.latitude.lte = maxLat;
      }
    }

    if (minLng !== undefined || maxLng !== undefined) {
      where.longitude = {};

      if (minLng !== undefined) {
        where.longitude.gte = minLng;
      }

      if (maxLng !== undefined) {
        where.longitude.lte = maxLng;
      }
    }

    return where;
  }

  _buildLocationLockKeys(latitude, longitude) {
    const latBucket = Math.round(Number(latitude) * 1000);
    const lngBucket = Math.round(Number(longitude) * 1000);
    const keys = [];

    for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
      for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
        keys.push([latBucket + latOffset, lngBucket + lngOffset]);
      }
    }

    return keys.sort((left, right) => {
      if (left[0] !== right[0]) {
        return left[0] - right[0];
      }

      return left[1] - right[1];
    });
  }

  async _acquireLocationAdvisoryLocks(tx, latitude, longitude) {
    const lockKeys = this._buildLocationLockKeys(latitude, longitude);

    for (const [key1, key2] of lockKeys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key1}, ${key2})`;
    }
  }

  async _findNearestByLocationWithinRadiusWithClient(
    dbClient,
    latitude,
    longitude,
    radiusMeters,
    excludeId
  ) {
    const originLat = Number(latitude);
    const originLng = Number(longitude);

    const { minLat, maxLat, minLng, maxLng } = getBoundingBoxByRadiusMeters(
      originLat,
      originLng,
      radiusMeters
    );

    const excludedCheckpointId = excludeId ?? null;
    const excludeClause =
      excludedCheckpointId === null
        ? Prisma.empty
        : Prisma.sql`AND c.id <> ${excludedCheckpointId}`;

    const nearestRows = await dbClient.$queryRaw`
      WITH candidates AS (
        SELECT
          c.id,
          6371000 * 2 * ASIN(
            SQRT(
              POWER(SIN(RADIANS((${originLat} - c.latitude::double precision) / 2)), 2)
              + COS(RADIANS(${originLat})) * COS(RADIANS(c.latitude::double precision))
              * POWER(SIN(RADIANS((${originLng} - c.longitude::double precision) / 2)), 2)
            )
          ) AS distance_meters
        FROM checkpoints c
        WHERE c.latitude BETWEEN ${minLat} AND ${maxLat}
          AND c.longitude BETWEEN ${minLng} AND ${maxLng}
          ${excludeClause}
      )
      SELECT id, distance_meters
      FROM candidates
      WHERE distance_meters <= ${radiusMeters}
      ORDER BY distance_meters ASC, id ASC
      LIMIT 1
    `;

    const nearest = nearestRows?.[0];

    if (!nearest) {
      return null;
    }

    return {
      id: Number(nearest.id),
      distanceMeters: Number(nearest.distance_meters),
    };
  }

  async _ensureNoDuplicateWithinRadiusTx(
    tx,
    { latitude, longitude, radiusMeters, excludeId = undefined }
  ) {
    const conflictingCheckpoint = await this._findNearestByLocationWithinRadiusWithClient(
      tx,
      latitude,
      longitude,
      radiusMeters,
      excludeId
    );

    if (!conflictingCheckpoint) {
      return;
    }

    throw buildRepoError(
      CHECKPOINT_REPO_ERROR_CODES.DUPLICATE_LOCATION_CONFLICT,
      'Checkpoint already exists within duplicate radius',
      {
        conflictingCheckpoint,
      }
    );
  }

  _checkpointMutationData(data) {
    return {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.area !== undefined && { area: data.area }),
      ...(data.road !== undefined && { road: data.road }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.latitude !== undefined && { latitude: data.latitude }),
      ...(data.longitude !== undefined && { longitude: data.longitude }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.createdBy !== undefined && { createdBy: data.createdBy }),
    };
  }

  async _createAuditLog(
    tx,
    { checkpointId, checkpointRefId, actorId, action, reason, oldValues, newValues }
  ) {
    await tx.checkpointAuditLog.create({
      data: {
        checkpointId,
        checkpointRefId,
        actorId,
        action,
        reason: reason ?? null,
        oldValues: oldValues ?? null,
        newValues: newValues ?? null,
      },
    });
  }

  async _createStatusHistoryLog(tx, { checkpointId, changedBy, oldStatus, newStatus, notes }) {
    await tx.checkpointStatusHistory.create({
      data: {
        checkpointId,
        changedBy,
        oldStatus,
        newStatus,
        notes: notes ?? null,
      },
    });
  }

  _normalizeStatusHistoryRecord(record) {
    return {
      id: record.id,
      actor: record.user
        ? {
            id: record.user.id,
            firstName: record.user.firstName,
            lastName: record.user.lastName,
          }
        : null,
      before: {
        status: record.oldStatus,
      },
      after: {
        status: record.newStatus,
      },
      notes: record.notes ?? null,
      timestamp: record.changedAt,
    };
  }

  _sortNearbyCheckpoints(checkpoints, sortBy, sortOrder) {
    const direction = sortOrder === 'desc' ? -1 : 1;

    return [...checkpoints].sort((left, right) => {
      let compare = 0;

      if (sortBy === 'distance') {
        compare = left.distanceMeters - right.distanceMeters;
      } else if (sortBy === 'createdAt') {
        compare = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      } else if (sortBy === 'name') {
        compare = left.name.localeCompare(right.name);
      } else if (sortBy === 'status') {
        compare = left.status.localeCompare(right.status);
      }

      if (compare !== 0) {
        return compare * direction;
      }

      return (left.id - right.id) * direction;
    });
  }

  _normalizeNearbyCheckpointRow(row) {
    return {
      id: row.id,
      name: row.name,
      area: row.area,
      road: row.road,
      city: row.city,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      distanceMeters: Number(row.distance_meters),
    };
  }

  async _findNearbyWithSql({
    originLat,
    originLng,
    minLat,
    maxLat,
    minLng,
    maxLng,
    status,
    radiusMeters,
    skip,
    take,
    sortBy,
    sortOrder,
  }) {
    const orderDirection = sortOrder === 'desc' ? 'DESC' : 'ASC';
    const orderByMap = {
      distance: 'distance_meters',
      createdAt: 'created_at',
      name: 'name',
      status: 'status',
    };
    const orderByColumn = orderByMap[sortBy] ?? orderByMap.distance;
    const orderByClause = `${orderByColumn} ${orderDirection}, id ${orderDirection}`;

    const distanceExpression = `
      6371000 * 2 * ASIN(
        SQRT(
          POWER(SIN(RADIANS(($1 - c.latitude::double precision) / 2)), 2)
          + COS(RADIANS($1)) * COS(RADIANS(c.latitude::double precision))
          * POWER(SIN(RADIANS(($2 - c.longitude::double precision) / 2)), 2)
        )
      )
    `;

    const params = [
      originLat,
      originLng,
      minLat,
      maxLat,
      minLng,
      maxLng,
      status ?? null,
      radiusMeters,
      skip,
      take,
    ];

    const checkpointsSql = `
      WITH candidates AS (
        SELECT
          c.id,
          c.name,
          c.area,
          c.road,
          c.city,
          c.description,
          c.latitude,
          c.longitude,
          c.status,
          c.created_at,
          c.updated_at,
          ${distanceExpression} AS distance_meters
        FROM checkpoints c
        WHERE c.latitude BETWEEN $3 AND $4
          AND c.longitude BETWEEN $5 AND $6
          AND ($7::text IS NULL OR c.status::text = $7)
      )
      SELECT *
      FROM candidates
      WHERE distance_meters <= $8
      ORDER BY ${orderByClause}
      OFFSET $9
      LIMIT $10
    `;

    const totalSql = `
      WITH candidates AS (
        SELECT ${distanceExpression} AS distance_meters
        FROM checkpoints c
        WHERE c.latitude BETWEEN $3 AND $4
          AND c.longitude BETWEEN $5 AND $6
          AND ($7::text IS NULL OR c.status::text = $7)
      )
      SELECT COUNT(*)::int AS total
      FROM candidates
      WHERE distance_meters <= $8
    `;

    const [checkpointsResult, totalResult] = await Promise.all([
      query(checkpointsSql, params),
      query(totalSql, params.slice(0, 8)),
    ]);

    const checkpoints = checkpointsResult.rows.map((row) =>
      this._normalizeNearbyCheckpointRow(row)
    );
    const total = totalResult.rows[0]?.total ?? 0;

    return {
      checkpoints,
      total: Number(total),
    };
  }

  async findMany({
    status,
    search,
    minLat,
    maxLat,
    minLng,
    maxLng,
    skip,
    take,
    sortBy,
    sortOrder,
  }) {
    const where = this._buildWhere({ status, search, minLat, maxLat, minLng, maxLng });

    const { checkpoints, total } = await prismaTransaction(async (tx) => {
      const checkpoints = await tx.checkpoint.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take,
        select: this._baseSelect(),
      });

      const total = await tx.checkpoint.count({ where });

      return { checkpoints, total };
    });

    return {
      checkpoints,
      total,
    };
  }

  async findNearestByLocationWithinRadius(latitude, longitude, radiusMeters, excludeId) {
    return this._findNearestByLocationWithinRadiusWithClient(
      prisma,
      latitude,
      longitude,
      radiusMeters,
      excludeId
    );
  }

  async findNearby({ lat, lng, radiusMeters, status, skip, take, sortBy, sortOrder }) {
    const originLat = Number(lat);
    const originLng = Number(lng);

    const { minLat, maxLat, minLng, maxLng } = getBoundingBoxByRadiusMeters(
      originLat,
      originLng,
      radiusMeters
    );

    return this._findNearbyWithSql({
      originLat,
      originLng,
      minLat,
      maxLat,
      minLng,
      maxLng,
      status,
      radiusMeters,
      skip,
      take,
      sortBy,
      sortOrder,
    });
  }

  async createWithAudit({ data, audit, duplicateGuard }) {
    return prismaTransaction(async (tx) => {
      if (duplicateGuard) {
        await this._acquireLocationAdvisoryLocks(
          tx,
          duplicateGuard.latitude,
          duplicateGuard.longitude
        );

        await this._ensureNoDuplicateWithinRadiusTx(tx, {
          latitude: duplicateGuard.latitude,
          longitude: duplicateGuard.longitude,
          radiusMeters: duplicateGuard.radiusMeters,
        });
      }

      const createdCheckpoint = await tx.checkpoint.create({
        data: this._checkpointMutationData(data),
        select: this._baseSelect(),
      });

      await this._createAuditLog(tx, {
        checkpointId: createdCheckpoint.id,
        checkpointRefId: createdCheckpoint.id,
        actorId: audit.actorId,
        action: audit.action,
        reason: audit.reason,
        oldValues: audit.oldValues,
        newValues: audit.newValues,
      });

      return createdCheckpoint;
    });
  }

  async findById(id) {
    return prisma.checkpoint.findUnique({
      where: { id },
      select: this._baseSelect(),
    });
  }

  async findByIdForDeleteAudit(id) {
    return prisma.checkpoint.findUnique({
      where: { id },
      select: {
        ...this._baseSelect(),
        createdBy: true,
      },
    });
  }

  async findStatusHistory(
    checkpointId,
    { changedBy, oldStatus, newStatus, fromDate, toDate, skip, take, sortBy, sortOrder }
  ) {
    const where = {
      checkpointId,
      ...(changedBy ? { changedBy } : {}),
      ...(oldStatus ? { oldStatus } : {}),
      ...(newStatus ? { newStatus } : {}),
      ...(fromDate || toDate
        ? {
            changedAt: {
              ...(fromDate ? { gte: new Date(fromDate) } : {}),
              ...(toDate ? { lte: new Date(toDate) } : {}),
            },
          }
        : {}),
    };

    const { records, total } = await prismaTransaction(async (tx) => {
      const records = await tx.checkpointStatusHistory.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        select: {
          id: true,
          oldStatus: true,
          newStatus: true,
          notes: true,
          changedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      const total = await tx.checkpointStatusHistory.count({
        where,
      });

      return { records, total };
    });

    return {
      history: records.map((record) => this._normalizeStatusHistoryRecord(record)),
      total,
    };
  }

  async updateByIdWithAudit(
    id,
    { data, audit, statusHistory, expectedCurrentStatus, duplicateGuard }
  ) {
    return prismaTransaction(async (tx) => {
      const mutationData = this._checkpointMutationData(data);
      let updatedCheckpoint;

      if (duplicateGuard) {
        await this._acquireLocationAdvisoryLocks(
          tx,
          duplicateGuard.latitude,
          duplicateGuard.longitude
        );

        await this._ensureNoDuplicateWithinRadiusTx(tx, {
          latitude: duplicateGuard.latitude,
          longitude: duplicateGuard.longitude,
          radiusMeters: duplicateGuard.radiusMeters,
          excludeId: duplicateGuard.excludeId ?? id,
        });
      }

      if (expectedCurrentStatus !== undefined && expectedCurrentStatus !== null) {
        const updateResult = await tx.checkpoint.updateMany({
          where: {
            id,
            status: expectedCurrentStatus,
          },
          data: mutationData,
        });

        if (updateResult.count === 0) {
          const existingCheckpoint = await tx.checkpoint.findUnique({
            where: { id },
            select: {
              id: true,
            },
          });

          if (!existingCheckpoint) {
            throw buildRepoError(
              CHECKPOINT_REPO_ERROR_CODES.NOT_FOUND,
              `Checkpoint with id ${id} not found`
            );
          }

          throw buildRepoError(
            CHECKPOINT_REPO_ERROR_CODES.CONCURRENT_STATUS_CONFLICT,
            `Checkpoint status for id ${id} changed before update`
          );
        }

        updatedCheckpoint = await tx.checkpoint.findUnique({
          where: { id },
          select: this._baseSelect(),
        });

        if (!updatedCheckpoint) {
          throw buildRepoError(
            CHECKPOINT_REPO_ERROR_CODES.NOT_FOUND,
            `Checkpoint with id ${id} not found`
          );
        }
      } else {
        updatedCheckpoint = await tx.checkpoint.update({
          where: { id },
          data: mutationData,
          select: this._baseSelect(),
        });
      }

      if (statusHistory) {
        await this._createStatusHistoryLog(tx, {
          checkpointId: id,
          changedBy: statusHistory.changedBy,
          oldStatus: statusHistory.oldStatus,
          newStatus: statusHistory.newStatus,
          notes: statusHistory.notes,
        });
      }

      await this._createAuditLog(tx, {
        checkpointId: id,
        checkpointRefId: id,
        actorId: audit.actorId,
        action: audit.action,
        reason: audit.reason,
        oldValues: audit.oldValues,
        newValues: audit.newValues,
      });

      return updatedCheckpoint;
    });
  }

  async deleteByIdWithAudit(id, audit) {
    return prismaTransaction(async (tx) => {
      await this._createAuditLog(tx, {
        checkpointId: id,
        checkpointRefId: id,
        actorId: audit.actorId,
        action: audit.action,
        reason: audit.reason,
        oldValues: audit.oldValues,
        newValues: audit.newValues,
      });

      await tx.checkpoint.delete({
        where: { id },
      });
    });
  }
}
