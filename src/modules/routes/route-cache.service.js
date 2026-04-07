export class RouteCacheService {
  constructor(routeCacheRepository) {
    this.routeCacheRepository = routeCacheRepository;
  }

  async invalidateCachesByCheckpointOrArea({ checkpointId, area }) {
    return this.routeCacheRepository.invalidateCachesByCheckpointOrArea({
      checkpointId,
      area,
    });
  }
}
