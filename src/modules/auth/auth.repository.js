import { query } from '#database/db.js';

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
    const result = await query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Find a user by ID.
   * @param {string} id
   */
  async findById(id) {
    const result = await query('SELECT id, email, role FROM users WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] ?? null;
  }

  /**
   * Create a new user.
   * @param {{ email: string, passwordHash: string, role?: string }} data
   * @param {{ trx?: import('pg').PoolClient }} options - Optional transaction client.
   */
  async create({ email, passwordHash, role = 'user' }, { trx } = {}) {
    const client = trx ?? { query: (text, params) => query(text, params) };
    const result = await client.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, passwordHash, role]
    );
    return result.rows[0];
  }

  /**
   * Save a refresh token for a user.
   * @param {string} userId
   * @param {string} tokenHash
   * @param {Date} expiresAt
   * @param {{ trx?: import('pg').PoolClient }} options
   */
  async saveRefreshToken(userId, tokenHash, expiresAt, { trx } = {}) {
    const client = trx ?? { query: (text, params) => query(text, params) };
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );
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
