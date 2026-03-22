export class CheckpointsController {
  constructor(checkpointsService) {
    this.checkpointsService = checkpointsService;
  }

  getAllCheckpoints = async (req, res) => {
    const result = await this.checkpointsService.getAllCheckpoints(req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  };

  getCheckpointById = async (req, res) => {
    const checkpoint = await this.checkpointsService.getCheckpointById(parseInt(req.params.id, 10));

    res.status(200).json({
      success: true,
      data: checkpoint,
    });
  };
}
