import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheIncrVersion,
  cacheGetVersion,
} from '#shared/utils/radis-cache.js';

const TTL = {
  LIST: 120, // 2 min
  SINGLE: 180, // 3 min
};

const VERSION_KEY = 'reports:list:version';

const _key = {
  list: (filters, version) => `reports:list:v${version}:${JSON.stringify(filters)}`,
  single: (id, scope) => `reports:single:${id}:${scope}`,
};

export const reportCache = {
  async getList(filters, role) {
    const version = await cacheGetVersion(VERSION_KEY);
    const key = _key.list({ ...filters, role }, version);
    return { cached: await cacheGet(key), key };
  },

  async setList(key, value) {
    return cacheSet(key, value, TTL.LIST);
  },

  async getSingle(id, scope) {
    const key = _key.single(id, scope);
    return { cached: await cacheGet(key), key };
  },

  async setSingle(key, value) {
    return cacheSet(key, value, TTL.SINGLE);
  },

  async invalidate(reportId) {
    await cacheDel(
      _key.single(reportId, 'anon'),
      _key.single(reportId, 'auth'),
      _key.single(reportId, 'mod')
    );
    await cacheIncrVersion(VERSION_KEY);
  },
};
