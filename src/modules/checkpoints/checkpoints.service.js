import { getPaginationParams } from '#shared/utils/pagination.js';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '#shared/utils/errors.js';
import { DUPLICATE_RADIUS_METERS } from '#shared/constants/duplicate-detection.js';
import { CHECKPOINT_STATUSES, CHECKPOINT_STATUS_TRANSITIONS } from '#shared/constants/enums.js';
import { isPrismaUniqueConstraintError } from '#shared/utils/prisma-errors.js';
import redisClient from '#shared/utils/radis.js';
import { logger } from '#shared/utils/logger.js';

const CACHE_TTL_LIST = 120;
const CACHE_TTL_SINGLE = 180;
const CACHE_TTL_NEARBY = 120;
const CACHE_VERSION_KEY = 'checkpoints:list:version';

const _cacheKey = {
  list: (filters, version) => `checkpoints:list:v${version}:${JSON.stringify(filters)}`,
  nearby: (filters, version) => `checkpoints:nearby:v${version}:${JSON.stringify(filters)}`,
  single: (id) => `checkpoints:single:${id}`,
};

const _getCache = async (key) => {
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

const _setCache = async (key, value, ttl) => {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    /* best-effort */
  }
};

const _getListCacheVersion = async () => {
  try {
    const version = await redisClient.get(CACHE_VERSION_KEY);
    return version ?? '1';
  } catch {
    return '1';
  }
};

const _invalidateCheckpointCache = async (checkpointId) => {
  try {
    if (checkpointId !== undefined && checkpointId !== null) {
      await redisClient.del(_cacheKey.single(checkpointId));
    }

    await redisClient.incr(CACHE_VERSION_KEY);
  } catch {
    /* best-effort */
  }
};

export class CheckpointsService {
  constructor(checkpointsRepository) {
    this.repo = checkpointsRepository;
    this.duplicateRadiusMeters = DUPLICATE_RADIUS_METERS.checkpoints;
  }

  _formatLog(action, stage, context = {}) {
    return `[checkpoints.service] ${action} ${stage} ${JSON.stringify(context)}`;
  }

  async _withLogging(action, context, operation) {
    try {
      const result = await operation();
      logger.info(this._formatLog(action, 'success', context));
      return result;
    } catch (error) {
      const failureContext = {
        ...context,
        error: error.message,
        statusCode: error?.statusCode,
      };

      if (error instanceof ConflictError) {
        logger.info(this._formatLog(action, 'failure', failureContext));
      } else if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
        logger.warn(this._formatLog(action, 'failure', failureContext));
      } else {
        logger.error(this._formatLog(action, 'failure', failureContext));
      }

      throw error;
    }
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

    return this._withLogging(
      'getAllCheckpoints',
      { status, search, minLat, maxLat, minLng, maxLng, page, limit, sortBy, sortOrder },
      async () => {
        const version = await _getListCacheVersion();
        const cacheKey = _cacheKey.list(
          {
            status,
            search,
            minLat,
            maxLat,
            minLng,
            maxLng,
            page,
            limit,
            sortBy,
            sortOrder,
          },
          version
        );
        const cached = await _getCache(cacheKey);

        if (cached) {
          return cached;
        }

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

        const result = {
          checkpoints,
          pagination: buildPaginationMeta(total),
        };

        await _setCache(cacheKey, result, CACHE_TTL_LIST);

        return result;
      }
    );
  }

  async getNearbyCheckpoints(filters) {
    const { lat, lng, radiusMeters, status, page, limit, sortBy, sortOrder } = filters;

    return this._withLogging(
      'getNearbyCheckpoints',
      { lat, lng, radiusMeters, status, page, limit, sortBy, sortOrder },
      async () => {
        const version = await _getListCacheVersion();
        const cacheKey = _cacheKey.nearby(
          {
            lat,
            lng,
            radiusMeters,
            status,
            page,
            limit,
            sortBy,
            sortOrder,
          },
          version
        );
        const cached = await _getCache(cacheKey);

        if (cached) {
          return cached;
        }

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

        const result = {
          checkpoints,
          pagination: buildPaginationMeta(total),
        };

        await _setCache(cacheKey, result, CACHE_TTL_NEARBY);

        return result;
      }
    );
  }

  async createCheckpoint(adminInfo, body) {
    const { name, area, road, city, description, latitude, longitude, status } = body;

    return this._withLogging(
      'createCheckpoint',
      { adminId: adminInfo.id, latitude, longitude, status: status ?? CHECKPOINT_STATUSES.OPEN },
      async () => {
        const existingCheckpoint = await this.repo.findNearestByLocationWithinRadius(
          latitude,
          longitude,
          this.duplicateRadiusMeters
        );

        if (existingCheckpoint) {
          throw new ConflictError(
            this._buildDuplicateCheckpointConflictMessage(existingCheckpoint)
          );
        }

        try {
          const createdCheckpoint = await this.repo.createWithAudit({
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

          await _invalidateCheckpointCache(createdCheckpoint.id);

          return createdCheckpoint;
        } catch (error) {
          if (this._isCheckpointLocationUniqueConstraintError(error)) {
            await this._throwDuplicateCheckpointConflict(latitude, longitude);
          }

          throw error;
        }
      }
    );
  }

  async getCheckpointById(id) {
    return this._withLogging('getCheckpointById', { checkpointId: id }, async () => {
      const cacheKey = _cacheKey.single(id);
      const cached = await _getCache(cacheKey);

      if (cached) {
        return cached;
      }

      const checkpoint = await this.repo.findById(id);

      if (!checkpoint) {
        throw new NotFoundError(`Checkpoint with id ${id}`);
      }

      await _setCache(cacheKey, checkpoint, CACHE_TTL_SINGLE);

      return checkpoint;
    });
  }

  async updateCheckpoint(id, body, adminInfo) {
    return this._withLogging(
      'updateCheckpoint',
      {
        checkpointId: id,
        adminId: adminInfo.id,
        hasLocationUpdate: body.latitude !== undefined || body.longitude !== undefined,
        hasStatusUpdate: body.status !== undefined,
      },
      async () => {
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
          const updatedCheckpoint = await this.repo.updateByIdWithAudit(id, {
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

          await _invalidateCheckpointCache(id);

          return updatedCheckpoint;
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
    );
  }

  async updateCheckpointStatus(id, body, adminInfo) {
    return this._withLogging(
      'updateCheckpointStatus',
      { checkpointId: id, adminId: adminInfo.id, nextStatus: body.status },
      async () => {
        const existingCheckpoint = await this.repo.findById(id);

        if (!existingCheckpoint) {
          throw new NotFoundError(`Checkpoint with id ${id}`);
        }

        this._assertValidStatusTransition(existingCheckpoint.status, body.status);

        const updatedCheckpoint = await this.repo.updateByIdWithAudit(id, {
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

        await _invalidateCheckpointCache(id);

        return updatedCheckpoint;
      }
    );
  }

  async getCheckpointStatusHistory(checkpointId, filters) {
    const { changedBy, oldStatus, newStatus, fromDate, toDate, page, limit, sortBy, sortOrder } =
      filters;

    return this._withLogging(
      'getCheckpointStatusHistory',
      { checkpointId, changedBy, oldStatus, newStatus, fromDate, toDate, page, limit },
      async () => {
        const checkpoint = await this.repo.findById(checkpointId);

        if (!checkpoint) {
          throw new NotFoundError(`Checkpoint with id ${checkpointId}`);
        }

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
    );
  }

  async deleteCheckpoint(id, adminInfo) {
    return this._withLogging(
      'deleteCheckpoint',
      { checkpointId: id, adminId: adminInfo.id },
      async () => {
        const checkpoint = await this.repo.findByIdForDeleteAudit(id);

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
            createdBy: checkpoint.createdBy ?? null,
          },
          newValues: null,
        });

        await _invalidateCheckpointCache(id);
      }
    );
  }
}
