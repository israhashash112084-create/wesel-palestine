import { getPaginationParams } from '#shared/utils/pagination.js';
import { NotFoundError } from '#shared/utils/errors.js';
import { ConflictError } from '#shared/utils/errors.js';

export class CheckpointsService {
  constructor(checkpointsRepository) {
    this.repo = checkpointsRepository;
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

    const existingCheckpoint = await this.repo.findByCoordinates(latitude, longitude);

    if (existingCheckpoint) {
      throw new ConflictError(
        `Checkpoint already exists at coordinates (${latitude}, ${longitude})`
      );
    }

    return this.repo.create({
      name,
      areaName,
      description,
      latitude,
      longitude,
      status,
      createdBy: adminInfo.id,
    });
  }

  async getCheckpointById(id) {
    const checkpoint = await this.repo.findById(id);

    if (!checkpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    return checkpoint;
  }
}
