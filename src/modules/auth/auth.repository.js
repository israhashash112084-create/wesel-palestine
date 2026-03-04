import { query } from '#database/db.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

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
      },
    });

    return user;
  }

  /**
   * Save a refresh token for a user.
   * @param {string} userId
   * @param {string} tokenHash
   * @param {Date} expiresAt
   */
  async saveRefreshToken(userId, tokenHash, expiresAt) {
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  /**
   * Find and validate an existing refresh token row by token hash.
   * @param {string} tokenHash
   */
  async findRefreshToken(tokenHash) {
    const result = await query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1',
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Delete a refresh token by hash (used on logout or rotation).
   * @param {string} tokenHash
   */
  async deleteRefreshToken(tokenHash) {
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  }

  /**
   * Delete all refresh tokens for a user (used on logout-all-devices).
   * @param {string} userId
   */
  async deleteAllUserRefreshTokens(userId) {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }
}
