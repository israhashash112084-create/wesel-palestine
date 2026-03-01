import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '#config/env.js';
import { ConflictError, UnauthorizedError } from '#shared/utils/errors.js';

const BCRYPT_ROUNDS = 12;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Auth service — all business logic for authentication.
 * Dependencies are injected via the constructor (Dependency Injection).
 */
export class AuthService {
  /**
   * @param {import('./auth.repository.js').AuthRepository} authRepository
   */
  constructor(authRepository) {
    this.authRepository = authRepository;
  }

  /**
   * Register a new user.
   * @param {{ email: string, password: string }} data
   */
  async register({ email, password }) {
    const existing = await this.authRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.authRepository.create({ email, passwordHash });

    return { user };
  }

  /**
   * Log in and return access + refresh tokens.
   * @param {{ email: string, password: string }} credentials
   */
  async login({ email, password }) {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this._issueTokens(user);
    return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
  }

  /**
   * Rotate refresh token and issue new access token.
   * @param {string} incomingRefreshToken
   */
  async refresh(incomingRefreshToken) {
    const tokenHash = hashToken(incomingRefreshToken);
    const storedToken = await this.authRepository.findRefreshToken(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Verify the JWT signature
    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, config.jwt.refreshSecret);
    } catch {
      // Token tampered or expired — delete the DB record and reject
      await this.authRepository.deleteRefreshToken(tokenHash);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await this.authRepository.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Rotate: delete old, issue new
    await this.authRepository.deleteRefreshToken(tokenHash);
    const { accessToken, refreshToken: newRefreshToken } = await this._issueTokens(user);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout — invalidate the specific refresh token.
   * @param {string} refreshToken
   */
  async logout(refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await this.authRepository.deleteRefreshToken(tokenHash);
  }

  /**
   * Internal helper: sign JWTs and persist refresh token hash to DB.
   * @param {{ id: string, email: string, role: string }} user
   */
  async _issueTokens(user) {
    const payload = { id: user.id, email: user.email, role: user.role };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.authRepository.saveRefreshToken(user.id, tokenHash, expiresAt);

    return { accessToken, refreshToken };
  }
}
