import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '#config/env.js';
import { ConflictError, UnauthorizedError } from '#shared/utils/errors.js';
import ms from 'ms';

const BCRYPT_ROUNDS = 12;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Auth service — all business logic for authentication.
 * Dependencies are injected via the constructor (Dependency Injection).
 */
export class AuthService {
  /**
   * @param {import('./auth.repository.js').AuthRepository} authRepository
   * @param {{
   *  reportsService?: { getUserStats: (userId: string) => Promise<object> },
   *  incidentsService?: { getUserStats: (userId: string, role: string) => Promise<object> },
   *  routesService?: { getUserStats: (userId: string) => Promise<object> },
   *  alertsService?: { getUserStats: (userId: string) => Promise<object> },
   * }} [deps]
   */
  constructor(authRepository, deps = {}) {
    this.authRepository = authRepository;
    this.reportsService = deps.reportsService;
    this.incidentsService = deps.incidentsService;
    this.routesService = deps.routesService;
    this.alertsService = deps.alertsService;
  }

  _emptyStats() {
    return {
      counts: {
        reportsSubmitted: 0,
        votesCast: 0,
        incidentsReported: 0,
        incidentsModerated: 0,
        activeSubscriptions: 0,
        inactiveSubscriptions: 0,
        sessionsActive: 0,
        routeQueries: 0,
      },
      routeHistory: {
        totalDelayMinutes: 0,
        totalDistanceKm: 0,
        avgDelayMinutes: 0,
        avgDistanceKm: 0,
        totalQueries: 0,
      },
      breakdowns: {
        reportsByStatus: {},
        reportsByType: {},
        votesByValue: {},
        reportedIncidentsByStatus: {},
        routeHistoryByMode: { primary: 0, fallback: 0 },
        activeSubscriptionsByCategory: {},
        moderatedIncidentsByStatus: {},
      },
    };
  }

  _mergeStats(base, patch) {
    if (!patch || typeof patch !== 'object') {
      return;
    }

    if (patch.counts && typeof patch.counts === 'object') {
      Object.assign(base.counts, patch.counts);
    }

    if (patch.routeHistory && typeof patch.routeHistory === 'object') {
      Object.assign(base.routeHistory, patch.routeHistory);
    }

    if (patch.breakdowns && typeof patch.breakdowns === 'object') {
      for (const [key, value] of Object.entries(patch.breakdowns)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          base.breakdowns[key] = { ...(base.breakdowns[key] ?? {}), ...value };
        } else {
          base.breakdowns[key] = value;
        }
      }
    }
  }

  /**
   * Register a new user.
   * @param {{ firstName: string, lastName: string, email: string, password: string }} data
   */
  async register({ firstName, lastName, email, password }) {
    const existing = await this.authRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.authRepository.create({ firstName, lastName, email, passwordHash });

    return user;
  }

  /**
   * Log in and return access + refresh tokens.
   * @param {{ email: string, password: string }} credentials
   * @param {{ deviceId: string, deviceName: string }} deviceInfo
   */
  async login({ email, password }, deviceInfo) {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this._issueTokens(user, deviceInfo);
    return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
  }

  /**
   * Rotate refresh token and issue new access token for the same device.
   * @param {string} incomingRefreshToken
   */
  async refresh(incomingRefreshToken) {
    const refreshTokenHash = hashToken(incomingRefreshToken);
    const storedToken = await this.authRepository.findRefreshToken(refreshTokenHash);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Verify the JWT signature
    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      // Token tampered or expired — delete the DB record and reject
      await this.authRepository.deleteRefreshToken(refreshTokenHash);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await this.authRepository.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Rotate: upsert replaces the old hash for the same device
    const deviceInfo = { deviceId: storedToken.deviceId, deviceName: storedToken.deviceName };
    const { accessToken, refreshToken: newRefreshToken } = await this._issueTokens(
      user,
      deviceInfo
    );

    return { accessToken, newRefreshToken };
  }

  /**
   * Logout — invalidate the specific refresh token.
   * @param {string} refreshToken
   */
  async logout(refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    await this.authRepository.deleteRefreshToken(refreshTokenHash);
  }

  /**
   * Retrieve authenticated user profile and stats.
   * @param {string} userId
   */
  async me(userId) {
    const user = await this.authRepository.findProfileById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const [sessionStats, reportsStats, incidentsStats, routesStats, alertsStats] =
      await Promise.all([
        this.authRepository.getSessionStats(user.id),
        this.reportsService?.getUserStats?.(user.id) ?? Promise.resolve({}),
        this.incidentsService?.getUserStats?.(user.id, user.role) ?? Promise.resolve({}),
        this.routesService?.getUserStats?.(user.id) ?? Promise.resolve({}),
        this.alertsService?.getUserStats?.(user.id) ?? Promise.resolve({}),
      ]);

    const stats = this._emptyStats();
    this._mergeStats(stats, sessionStats);
    this._mergeStats(stats, reportsStats);
    this._mergeStats(stats, incidentsStats);
    this._mergeStats(stats, routesStats);
    this._mergeStats(stats, alertsStats);

    return { user, stats };
  }

  /**
   * Internal helper: sign JWTs and upsert refresh token hash to DB.
   * If the device already has an active session, its token is replaced.
   * Otherwise a new session row is created.
   *
   * @param {{ id: string, email: string, role: string }} user
   * @param {{ deviceId: string, deviceName: string }} deviceInfo
   */
  async _issueTokens(user, deviceInfo) {
    const payload = { id: user.id, email: user.email, role: user.role };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    });

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    });

    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN));

    await this.authRepository.upsertRefreshToken(
      user.id,
      refreshTokenHash,
      expiresAt,
      deviceInfo.deviceId,
      deviceInfo.deviceName
    );

    await this.authRepository.enforceSessionCap(user.id);

    return { accessToken, refreshToken };
  }
}
