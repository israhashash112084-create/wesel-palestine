import { UnauthorizedError } from '#shared/utils/errors.js';
import { env } from '#config/env.js';
import crypto from 'crypto';
import ms from 'ms';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'Strict',
};

const REFRESH_TOKEN_MAX_AGE = ms(env.JWT_REFRESH_EXPIRES_IN); // 7 days in ms

/**
 * Derives a stable device fingerprint from the User-Agent and IP address.
 * Used as a fallback when the client does not send an X-Device-ID header.
 *
 * @param {import('express').Request} req
 * @returns {string} 64-char hex string
 */
const _fingerprintDevice = (req) => {
  const ua = req.headers['user-agent'] ?? 'Unknown Device';
  const ip = req.ip ?? '';
  return crypto.createHash('sha256').update(`${ua}:${ip}`).digest('hex');
};

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
    const user = await this.authService.register(req.body);
    res.status(201).json({ success: true, data: { user } });
  };

  login = async (req, res) => {
    const deviceInfo = {
      deviceId: req.headers['x-device-id'] ?? _fingerprintDevice(req),
      deviceName: req.headers['user-agent'] ?? 'Unknown Device',
    };

    const { user, accessToken, refreshToken } = await this.authService.login(req.body, deviceInfo);

    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    res.status(200).json({ success: true, data: { user, accessToken } });
  };

  refresh = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token provided');
    }

    const { accessToken, newRefreshToken } = await this.authService.refresh(refreshToken);

    res.cookie('refreshToken', newRefreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    res.status(200).json({ success: true, data: { accessToken } });
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
    res.status(200).json({ success: true, data: { user: req.userInfo } });
  };
}
