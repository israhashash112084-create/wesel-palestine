import { getPaginationParams } from '#shared/utils/pagination.js';
import { NotFoundError } from '#shared/utils/errors.js';

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

  async getCheckpointById(id) {
    const checkpoint = await this.repo.findById(id);

    if (!checkpoint) {
      throw new NotFoundError(`Checkpoint with id ${id}`);
    }

    return checkpoint;
  }
}
