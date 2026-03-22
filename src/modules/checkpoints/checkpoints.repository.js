import { prisma, prismaTransaction } from '#database/db.js';
import {
  findNearestCandidateWithinRadiusMeters,
  getBoundingBoxByRadiusMeters,
} from '#shared/utils/geo.js';

export class CheckpointsRepository {
  _baseSelect() {
    return {
      id: true,
      name: true,
      areaName: true,
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
          areaName: {
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

  _checkpointMutationData(data) {
    return {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.areaName !== undefined && { areaName: data.areaName }),
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
    const { minLat, maxLat, minLng, maxLng } = getBoundingBoxByRadiusMeters(
      Number(latitude),
      Number(longitude),
      radiusMeters
    );

    const where = {
      latitude: {
        gte: minLat,
        lte: maxLat,
      },
      longitude: {
        gte: minLng,
        lte: maxLng,
      },
      ...(excludeId !== undefined &&
        excludeId !== null && {
          id: {
            not: excludeId,
          },
        }),
    };

    const candidateCheckpoints = await prisma.checkpoint.findMany({
      where,
      select: {
        id: true,
        latitude: true,
        longitude: true,
      },
    });

    const nearest = findNearestCandidateWithinRadiusMeters({
      originLat: Number(latitude),
      originLng: Number(longitude),
      candidates: candidateCheckpoints,
      radiusMeters,
      getLat: (candidate) => candidate.latitude,
      getLng: (candidate) => candidate.longitude,
    });

    if (!nearest) {
      return null;
    }

    return {
      id: nearest.candidate.id,
      distanceMeters: nearest.distanceMeters,
    };
  }

  async createWithAudit({ data, audit }) {
    return prismaTransaction(async (tx) => {
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

  async findStatusHistory(checkpointId, { skip, take, sortBy, sortOrder }) {
    const { records, total } = await prismaTransaction(async (tx) => {
      const records = await tx.checkpointStatusHistory.findMany({
        where: { checkpointId },
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
        where: { checkpointId },
      });

      return { records, total };
    });

    return {
      history: records.map((record) => this._normalizeStatusHistoryRecord(record)),
      total,
    };
  }

  async updateByIdWithAudit(id, { data, audit, statusHistory }) {
    return prismaTransaction(async (tx) => {
      const updatedCheckpoint = await tx.checkpoint.update({
        where: { id },
        data: this._checkpointMutationData(data),
        select: this._baseSelect(),
      });

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
