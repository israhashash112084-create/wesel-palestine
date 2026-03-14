export class RoutesController {

  /**
   * @param {import('./routes.service.js').RoutesService} routesService
   */
  constructor(routesService) {
    this.routesService = routesService;
  }

  estimate = async (req, res) => {
    const result = await this.routesService.estimateRoute(req.body);

    res.status(200).json({
      success: true,
      data:    result,
    });
  };
}
