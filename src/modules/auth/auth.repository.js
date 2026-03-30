import { prisma } from '#database/db.js';

/**
 * Auth repository — handles all auth-related DB queries.
 * Accepted as a constructor dependency by AuthService (Dependency Injection).
 */
export class AuthRepository {
  /**
   * Find a user by email.
   * @param {string} email
   */
  async findByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
    });
    return user ?? null;
  }

  /**
   * Find a user by ID.
   * @param {string} id
   */
  async findById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    return user ?? null;
  }

  /**
   * Create a new user.
   * @param {{ firstName: string, lastName: string, email: string, passwordHash: string, role?: string }} data
   */
  async create({ firstName, lastName, email, passwordHash }) {
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    return user;
  }

  /**
   * Upsert a refresh token for a specific device.
   * If a session for (userId, deviceId) already exists it is replaced;
   * otherwise a new row is created. This enforces one active session
   * per device per user.
   *
   * @param {string} userId
   * @param {string} tokenHash
   * @param {Date} expiresAt
   * @param {string} deviceId - Stable device identifier.
   * @param {string} deviceName - Human-readable device label (User-Agent).
   */
  async upsertRefreshToken(userId, tokenHash, expiresAt, deviceId, deviceName) {
    await prisma.refreshToken.upsert({
      // eslint-disable-next-line camelcase
      where: { userId_deviceId: { userId, deviceId } },
      update: { tokenHash, expiresAt, lastUsedAt: new Date() },
      create: { userId, tokenHash, expiresAt, deviceId, deviceName },
    });
  }

  /**
   * Find and validate an existing refresh token row by token hash.
   * Returns the full record including deviceId and deviceName for rotation.
   * @param {string} tokenHash
   */
  async findRefreshToken(tokenHash) {
    return await prisma.refreshToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
    });
  }

  /**
   * Delete a refresh token by hash (used on logout or rotation).
   * @param {string} tokenHash
   */
  async deleteRefreshToken(tokenHash) {
    await prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });
  }

  /**
   * Delete all refresh tokens for a user (used on logout-all-devices).
   * @param {string} userId
   */
  async deleteAllUserRefreshTokens(userId) {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * Enforce a cap on the number of active sessions for a user.
   * @param {string} userId
   * @param {number} cap - maximum allowed active sessions (default: 5)
   * @returns {Promise<void>}
   * @remarks
   * This method should be called after issuing a new refresh token to ensure the user doesn't exceed the session limit.
   * It deletes expired tokens first, then evicts the oldest active tokens if still over the cap.
   */

  async enforceSessionCap(userId, cap = 5) {
    const tokens = await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    // delete expired first
    const now = new Date();
    const expired = tokens.filter((t) => t.expiresAt <= now);
    if (expired.length) {
      await prisma.refreshToken.deleteMany({
        where: { id: { in: expired.map((t) => t.id) } },
      });
    }
    // if still over cap, evict oldest
    const active = tokens.filter((t) => t.expiresAt > now);
    if (active.length >= cap) {
      const toEvict = active.slice(0, active.length - cap + 1);
      await prisma.refreshToken.deleteMany({
        where: { id: { in: toEvict.map((t) => t.id) } },
      });
    }
  }
}
