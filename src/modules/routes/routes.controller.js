export class RoutesController {
  /**
   * @param {import('./routes.service.js').RoutesService} routesService
   */
  constructor(routesService) {
    this.routesService = routesService;
  }

  estimate = async (req, res) => {
    const result = await this.routesService.estimateRoute(req.body, req.userInfo.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  };

  getHistory = async (req, res) => {
    const result = await this.routesService.getRouteHistory(req.query, req.userInfo.id);

  res.status(200).json({
    success: true,
    data: result,
  });
};

compare = async (req, res) => {
  const result = await this.routesService.compareRoutes(req.body, req.userInfo.id);

  res.status(200).json({
    success: true,
    data: result,
  });
};

getAreasStatus = async (req, res) => {
  const result = await this.routesService.getAreasStatus();

  res.status(200).json({
    success: true,
    data: result,
  });
};

getHistoryStats = async (req, res) => {
  const result = await this.routesService.getRouteHistoryStats(req.userInfo.id);

  res.status(200).json({
    success: true,
    data: result,
  });
};

getActiveCheckpoints = async (req, res) => {
  const result = await this.routesService.getActiveCheckpoints();

  res.status(200).json({
    success: true,
    data: result,
  });
};

getActiveIncidents = async (req, res) => {
  const result = await this.routesService.getActiveIncidents();

  res.status(200).json({
    success: true,
    data: result,
  });
};

getRouteById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await this.routesService.getRouteById(id, req.userInfo.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

deleteRouteById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await this.routesService.deleteRouteById(id, req.userInfo.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
}
