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
}
