import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from '#config/env.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logLevels = {
  error: 0, //highest priority
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const devFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) =>
    stack ? `${ts} ${level}: ${message}\n${stack}` : `${ts} ${level}: ${message}`
  )
);

const devConsoleFormat = combine(colorize(), devFormat);

const prodFormat = combine(timestamp(), errors({ stack: true }), winston.format.json());

export const logger = winston.createLogger({
  levels: logLevels,
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production' ? prodFormat : devConsoleFormat,
    }),
  ],
});

const fileRotationTransport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info',
  format: prodFormat,
});

logger.add(fileRotationTransport);
