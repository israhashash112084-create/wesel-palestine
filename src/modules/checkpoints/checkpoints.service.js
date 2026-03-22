import { getPaginationParams } from '#shared/utils/pagination.js';
import { NotFoundError } from '#shared/utils/errors.js';
import { ConflictError } from '#shared/utils/errors.js';
import { BadRequestError } from '#shared/utils/errors.js';
import { DUPLICATE_RADIUS_METERS } from '#shared/constants/duplicate-detection.js';

export class CheckpointsService {
  constructor(checkpointsRepository) {
    this.repo = checkpointsRepository;
    this.duplicateRadiusMeters = DUPLICATE_RADIUS_METERS.checkpoints;
  }

  _toComparableValue(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
      return value.toString();
    }

    return value;
  }

  _buildAuditDiff(existingCheckpoint, body) {
    const updatableFields = ['name', 'areaName', 'description', 'latitude', 'longitude', 'status'];

    const oldValues = {};
    const newValues = {};

    for (const field of updatableFields) {
      if (body[field] === undefined) {
        continue;
      }

      const oldValue = this._toComparableValue(existingCheckpoint[field]);
      const newValue = this._toComparableValue(body[field]);

      if (oldValue !== newValue) {
        oldValues[field] = oldValue;
        newValues[field] = newValue;
      }
    }

    return { oldValues, newValues };
  }

  async getAllCheckpoints(filters) {
    const { status, search, minLat, maxLat, minLng, maxLng, page, limit, sortBy, sortOrder } =
      filters;

    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

    const { checkpoints, total } = await this.repo.findMany({
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
    });

    return {
      checkpoints,
      pagination: buildPaginationMeta(total),
    };
  }

  async createCheckpoint(adminInfo, body) {
    const { name, areaName, description, latitude, longitude, status } = body;

    const existingCheckpoint = await this.repo.findNearestByLocationWithinRadius(
      latitude,
      longitude,
      this.duplicateRadiusMeters
    );

    if (existingCheckpoint) {
      throw new ConflictError(
        `Checkpoint already exists within ${this.duplicateRadiusMeters}m (checkpoint #${existingCheckpoint.id}, distance: ${Math.round(existingCheckpoint.distanceMeters)}m)`
      );
    }

    return this.repo.createWithAudit({
      data: {
        name,
        areaName,
        description,
        latitude,
        longitude,
        status,
        createdBy: adminInfo.id,
      },
      audit: {
        actorId: adminInfo.id,
        action: 'created',
        oldValues: null,
        newValues: {
          name,
          areaName,
          description,
          latitude,
          longitude,
          status: status ?? 'open',
        },
      },
    });
  }

  async getCheckpointById(id) {
    const checkpoint = await this.repo.findById(id);

    if (!checkpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    return checkpoint;
  }

  async updateCheckpoint(id, body, adminInfo) {
    const existingCheckpoint = await this.repo.findById(id);

    if (!existingCheckpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    if (body.latitude !== undefined || body.longitude !== undefined) {
      const targetLatitude = body.latitude ?? this._toComparableValue(existingCheckpoint.latitude);
      const targetLongitude =
        body.longitude ?? this._toComparableValue(existingCheckpoint.longitude);

      const conflictingCheckpoint = await this.repo.findNearestByLocationWithinRadius(
        targetLatitude,
        targetLongitude,
        this.duplicateRadiusMeters,
        id
      );

      if (conflictingCheckpoint) {
        throw new ConflictError(
          `Checkpoint already exists within ${this.duplicateRadiusMeters}m (checkpoint #${conflictingCheckpoint.id}, distance: ${Math.round(conflictingCheckpoint.distanceMeters)}m)`
        );
      }
    }

    const { oldValues, newValues } = this._buildAuditDiff(existingCheckpoint, body);

    if (Object.keys(newValues).length === 0) {
      throw new BadRequestError('No changes detected in update payload');
    }

    const statusHistory =
      newValues.status !== undefined
        ? {
            changedBy: adminInfo.id,
            oldStatus: existingCheckpoint.status,
            newStatus: newValues.status,
            notes: body.notes,
          }
        : null;

    return this.repo.updateByIdWithAudit(id, {
      data: {
        name: body.name,
        areaName: body.areaName,
        description: body.description,
        latitude: body.latitude,
        longitude: body.longitude,
        status: body.status,
      },
      audit: {
        actorId: adminInfo.id,
        action: 'updated',
        oldValues,
        newValues,
      },
      statusHistory,
    });
  }

  async updateCheckpointStatus(id, body, adminInfo) {
    const existingCheckpoint = await this.repo.findById(id);

    if (!existingCheckpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    if (existingCheckpoint.status === body.status) {
      throw new BadRequestError('Checkpoint status is already set to the requested value');
    }

    return this.repo.updateByIdWithAudit(id, {
      data: {
        status: body.status,
      },
      audit: {
        actorId: adminInfo.id,
        action: 'updated',
        oldValues: {
          status: existingCheckpoint.status,
        },
        newValues: {
          status: body.status,
        },
      },
      statusHistory: {
        changedBy: adminInfo.id,
        oldStatus: existingCheckpoint.status,
        newStatus: body.status,
        notes: body.notes,
      },
    });
  }

  async getCheckpointStatusHistory(checkpointId, filters) {
    const checkpoint = await this.repo.findById(checkpointId);

    if (!checkpoint) {
      throw new NotFoundError(`Checkpoint with id ${checkpointId}`);
    }

    const { page, limit, sortBy, sortOrder } = filters;
    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

    const { history, total } = await this.repo.findStatusHistory(checkpointId, {
      skip,
      take,
      sortBy,
      sortOrder,
    });

    return {
      checkpointId,
      history,
      pagination: buildPaginationMeta(total),
    };
  }

  async deleteCheckpoint(id, adminInfo) {
    const checkpoint = await this.repo.findById(id);

    if (!checkpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    await this.repo.deleteByIdWithAudit(id, {
      actorId: adminInfo.id,
      action: 'deleted',
      oldValues: {
        name: checkpoint.name,
        areaName: checkpoint.areaName,
        description: checkpoint.description,
        latitude: this._toComparableValue(checkpoint.latitude),
        longitude: this._toComparableValue(checkpoint.longitude),
        status: checkpoint.status,
      },
      newValues: null,
    });
  }
}
