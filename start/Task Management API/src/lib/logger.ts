import winston from 'winston';
import { config } from '../config';

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  silent: config.NODE_ENV === 'test',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: config.NODE_ENV === 'test' ? [new winston.transports.Console()] : [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/api.log', maxsize: 2_000_000, maxFiles: 3 })
  ]
});
