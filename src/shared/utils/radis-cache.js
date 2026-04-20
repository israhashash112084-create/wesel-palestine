import redisClient from '#shared/utils/radis.js';
/**
 * @param {string} key
 * @returns {Promise<any|null>} parsed value or null on miss/error
 */
export const cacheGet = async (key) => {
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};
/**
 * @param {string} key
 * @param {any} value  — must be JSON-serializable
 * @param {number} ttl — seconds
 */
export const cacheSet = async (key, value, ttl) => {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    /* best-effort */
  }
};

/**
 * Delete one or more keys.
 * @param {...string} keys
 */
export const cacheDel = async (...keys) => {
  try {
    await redisClient.del(...keys);
  } catch {
    /* best-effort */
  }
};

/**
 * @param {string} versionKey
 */
export const cacheIncrVersion = async (versionKey) => {
  try {
    await redisClient.incr(versionKey);
  } catch {
    /* best-effort */
  }
};
/**
 * @param {string} versionKey
 * @param {string} [fallback='1']
 * @returns {Promise<string>}
 */
export const cacheGetVersion = async (versionKey, fallback = '1') => {
  try {
    return (await redisClient.get(versionKey)) ?? fallback;
  } catch {
    return fallback;
  }
};
