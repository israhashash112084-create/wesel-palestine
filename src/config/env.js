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
};
