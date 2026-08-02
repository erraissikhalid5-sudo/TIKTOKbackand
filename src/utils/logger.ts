import winston from 'winston';
import config from '../config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(errors({ stack: true }), timestamp(), logFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), errors({ stack: true }), timestamp(), logFormat),
    }),
  ],
});

export default logger;
