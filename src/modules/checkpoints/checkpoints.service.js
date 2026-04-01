import { getPaginationParams } from '#shared/utils/pagination.js';
import { NotFoundError, ConflictError, BadRequestError } from '#shared/utils/errors.js';
import { DUPLICATE_RADIUS_METERS } from '#shared/constants/duplicate-detection.js';
import { CHECKPOINT_STATUSES, CHECKPOINT_STATUS_TRANSITIONS } from '#shared/constants/enums.js';
import { isPrismaUniqueConstraintError } from '#shared/utils/prisma-errors.js';

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
    const updatableFields = [
      'name',
      'area',
      'road',
      'city',
      'description',
      'latitude',
      'longitude',
      'status',
    ];

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

  _isTransitionAllowed(currentStatus, nextStatus) {
    const allowedTransitions = CHECKPOINT_STATUS_TRANSITIONS[currentStatus] ?? [];
    return allowedTransitions.includes(nextStatus);
  }

  _assertValidStatusTransition(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) {
      throw new BadRequestError('Checkpoint status is already set to the requested value');
    }

    if (!this._isTransitionAllowed(currentStatus, nextStatus)) {
      throw new ConflictError(
        `Invalid checkpoint status transition from ${currentStatus} to ${nextStatus}`
      );
    }
  }

  _buildDuplicateCheckpointConflictMessage(conflictingCheckpoint) {
    return `Checkpoint already exists within ${this.duplicateRadiusMeters}m (checkpoint #${conflictingCheckpoint.id}, distance: ${Math.round(conflictingCheckpoint.distanceMeters)}m)`;
  }

  _isCheckpointLocationUniqueConstraintError(error) {
    return isPrismaUniqueConstraintError(error, {
      constraintNames: ['uq_checkpoints_lat_lng_exact'],
      fieldSets: [['latitude', 'longitude']],
    });
  }

  async _throwDuplicateCheckpointConflict(latitude, longitude, excludeId) {
    const conflictingCheckpoint = await this.repo.findNearestByLocationWithinRadius(
      latitude,
      longitude,
      this.duplicateRadiusMeters,
      excludeId
    );

    if (conflictingCheckpoint) {
      throw new ConflictError(this._buildDuplicateCheckpointConflictMessage(conflictingCheckpoint));
    }

    throw new ConflictError('Checkpoint location conflicts with an existing checkpoint');
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

  async getNearbyCheckpoints(filters) {
    const { lat, lng, radiusMeters, status, page, limit, sortBy, sortOrder } = filters;

    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

    const { checkpoints, total } = await this.repo.findNearby({
      lat,
      lng,
      radiusMeters,
      status,
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
    const { name, area, road, city, description, latitude, longitude, status } = body;

    const existingCheckpoint = await this.repo.findNearestByLocationWithinRadius(
      latitude,
      longitude,
      this.duplicateRadiusMeters
    );

    if (existingCheckpoint) {
      throw new ConflictError(this._buildDuplicateCheckpointConflictMessage(existingCheckpoint));
    }

    try {
      return await this.repo.createWithAudit({
        data: {
          name,
          area,
          road,
          city,
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
            area,
            road,
            city,
            description,
            latitude,
            longitude,
            status: status ?? CHECKPOINT_STATUSES.OPEN,
          },
        },
      });
    } catch (error) {
      if (this._isCheckpointLocationUniqueConstraintError(error)) {
        await this._throwDuplicateCheckpointConflict(latitude, longitude);
      }

      throw error;
    }
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

    let targetLatitude;
    let targetLongitude;

    if (body.latitude !== undefined || body.longitude !== undefined) {
      targetLatitude = body.latitude ?? this._toComparableValue(existingCheckpoint.latitude);
      targetLongitude = body.longitude ?? this._toComparableValue(existingCheckpoint.longitude);

      const conflictingCheckpoint = await this.repo.findNearestByLocationWithinRadius(
        targetLatitude,
        targetLongitude,
        this.duplicateRadiusMeters,
        id
      );

      if (conflictingCheckpoint) {
        throw new ConflictError(
          this._buildDuplicateCheckpointConflictMessage(conflictingCheckpoint)
        );
      }
    }

    if (body.status !== undefined && body.status !== existingCheckpoint.status) {
      this._assertValidStatusTransition(existingCheckpoint.status, body.status);
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

    try {
      return await this.repo.updateByIdWithAudit(id, {
        data: {
          name: body.name,
          area: body.area,
          road: body.road,
          city: body.city,
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
    } catch (error) {
      if (
        (body.latitude !== undefined || body.longitude !== undefined) &&
        this._isCheckpointLocationUniqueConstraintError(error)
      ) {
        await this._throwDuplicateCheckpointConflict(targetLatitude, targetLongitude, id);
      }

      throw error;
    }
  }

  async updateCheckpointStatus(id, body, adminInfo) {
    const existingCheckpoint = await this.repo.findById(id);

    if (!existingCheckpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    this._assertValidStatusTransition(existingCheckpoint.status, body.status);

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

    const { changedBy, oldStatus, newStatus, fromDate, toDate, page, limit, sortBy, sortOrder } =
      filters;
    const { skip, take, buildPaginationMeta } = getPaginationParams(page, limit);

    const { history, total } = await this.repo.findStatusHistory(checkpointId, {
      changedBy,
      oldStatus,
      newStatus,
      fromDate,
      toDate,
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
        area: checkpoint.area,
        road: checkpoint.road,
        city: checkpoint.city,
        description: checkpoint.description,
        latitude: this._toComparableValue(checkpoint.latitude),
        longitude: this._toComparableValue(checkpoint.longitude),
        status: checkpoint.status,
      },
      newValues: null,
    });
  }
}
