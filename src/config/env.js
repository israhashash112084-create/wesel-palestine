import dotenv from 'dotenv';

dotenv.config();

const required = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
};

const optional = (key, defaultValue) => process.env[key] ?? defaultValue;

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: optional('PORT', '3000'),

  DB_HOST: optional('DB_HOST', 'localhost'),
  DB_PORT: optional('DB_PORT', '5432'),
  DB_USER: required('DB_USER'),
  DB_PASSWORD: required('DB_PASSWORD'),
  DB_NAME: required('DB_NAME'),
  DB_SSL: optional('DB_SSL', 'false') === 'true',
  DB_MAX_POOL_SIZE: optional('DB_MAX_POOL_SIZE', '10'),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  REDIS_HOST: optional('REDIS_HOST', 'localhost'),
  REDIS_PORT: optional('REDIS_PORT', '6379'),
  REDIS_PASSWORD: optional('REDIS_PASSWORD', ''),
  RATE_LIMIT_WINDOW_MS: optional('RATE_LIMIT_WINDOW_MS', '600000'),
  RATE_LIMIT_MAX_REQUESTS: optional('RATE_LIMIT_MAX_REQUESTS', '10'),
  ROUTE_LIMIT_MAX_REQUESTS: optional('ROUTE_LIMIT_MAX_REQUESTS', '10'),
  ROUTE_LIMIT_WINDOW_MS: optional('ROUTE_LIMIT_WINDOW_MS', '60000'),
  AREA_RATE_LIMIT_MAX_REQUESTS: optional('AREA_RATE_LIMIT_MAX_REQUESTS', '5'),
  AREA_RATE_LIMIT_WINDOW_MS: optional('AREA_RATE_LIMIT_WINDOW_MS', '3600000'),

  OSRM_BASE_URL: optional('OSRM_BASE_URL', 'http://router.project-osrm.org'),

  WEATHER_API_KEY: required('WEATHER_API_KEY'),
  WEATHER_API_URL: optional('WEATHER_API_URL', 'https://api.openweathermap.org/data/2.5'),

  AREA_REPORT_LIMIT_MAX: optional('AREA_REPORT_LIMIT_MAX', '3'),
  AREA_REPORT_LIMIT_TTL_SEC: optional('AREA_REPORT_LIMIT_TTL_SEC', '21600'),

  SYSTEM_USER_ID: optional('SYSTEM_USER_ID', '00000000-0000-0000-0000-000000000000'),
};
