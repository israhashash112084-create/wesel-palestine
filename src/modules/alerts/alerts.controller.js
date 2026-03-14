export class AlertsController {
  /**
   * @param {import('./alerts.service.js').AlertsService} alertsService
   */
  constructor(alertsService) {
    this.alertsService = alertsService;
  }

  createSubscription = async (req, res) => {
    const subscription = await this.alertsService.createSubscription(req.userInfo.id, req.body);

    res.status(201).json({
      success: true,
      data: { subscription },
    });
  };

  getUserSubscriptions = async (req, res) => {
    const subscriptions = await this.alertsService.getUserSubscriptions(req.userInfo.id);

    res.status(200).json({
      success: true,
      data: { subscriptions },
    });
  };

  updateSubscription = async (req, res) => {
    const result = await this.alertsService.updateSubscription(
      req.userInfo.id,
      Number(req.params.id),
      req.body
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  };

  deactivateSubscription = async (req, res) => {
    const result = await this.alertsService.deactivateSubscription(
      req.userInfo.id,
      Number(req.params.id)
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  };

  getUserAlerts = async (req, res) => {
    const alerts = await this.alertsService.getUserAlerts(req.userInfo.id);

    res.status(200).json({
      success: true,
      data: { alerts },
    });
  };

  markAlertAsRead = async (req, res) => {
    const result = await this.alertsService.markAlertAsRead(
      req.userInfo.id,
      Number(req.params.id)
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  };
}