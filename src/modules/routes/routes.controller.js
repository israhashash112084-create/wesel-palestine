export class RoutesController {

  /**
   * @param {import('./routes.service.js').RoutesService} routesService
   */
  constructor(routesService) {
    this.routesService = routesService;
  }

  estimate = async (req, res) => {
    const result = await this.routesService.estimateRoute(req.body , req.userInfo.id);

    res.status(200).json({
      success: true,
      data:    result,
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

}
