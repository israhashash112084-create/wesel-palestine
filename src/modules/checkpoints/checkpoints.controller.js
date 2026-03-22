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

  createCheckpoint = async (req, res) => {
    const result = await this.checkpointsService.createCheckpoint(req.userInfo, req.body);

    res.status(201).json({
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

  updateCheckpoint = async (req, res) => {
    const updatedCheckpoint = await this.checkpointsService.updateCheckpoint(
      parseInt(req.params.id, 10),
      req.body,
      req.userInfo
    );

    res.status(200).json({
      success: true,
      data: updatedCheckpoint,
    });
  };

  updateCheckpointStatus = async (req, res) => {
    const updatedCheckpoint = await this.checkpointsService.updateCheckpointStatus(
      parseInt(req.params.id, 10),
      req.body,
      req.userInfo
    );

    res.status(200).json({
      success: true,
      data: updatedCheckpoint,
    });
  };

  deleteCheckpoint = async (req, res) => {
    await this.checkpointsService.deleteCheckpoint(parseInt(req.params.id, 10), req.userInfo);
    res.status(204).send();
  };
}
