import { UserRoles } from '#shared/constants/roles.js';

export class IncidentsService {
  constructor(incidentsRepository) {
    this.repo = incidentsRepository;
  }

  _isRegularUser(userInfo) {
    return userInfo?.role === UserRoles.USER;
  }

  async getAllIncidents(userInfo) {
    const isRegularUser = this._isRegularUser(userInfo);

    return isRegularUser ? this.repo.findByReportedBy(userInfo.id) : this.repo.findMany();
  }
}
