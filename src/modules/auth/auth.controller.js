import { config } from '#config/env.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Auth controller — handles HTTP layer only.
 * Business logic lives in AuthService (injected via constructor).
 */
export class AuthController {
  /**
   * @param {import('./auth.service.js').AuthService} authService
   */
  constructor(authService) {
    this.authService = authService;
  }

  register = async (req, res) => {
    const { user } = await this.authService.register(req.body);
    res.status(201).json({ success: true, data: { user } });
  };

  login = async (req, res) => {
    const { user, accessToken, refreshToken } = await this.authService.login(req.body);

    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    res.status(200).json({ success: true, data: { user } });
  };

  refresh = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'No refresh token provided' });
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.authService.refresh(refreshToken);

    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    res.cookie('refreshToken', newRefreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    res.status(200).json({ success: true });
  };

  logout = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(200).json({ success: true });
  };

  me = async (req, res) => {
    res.status(200).json({ success: true, data: { user: req.user } });
  };
}
