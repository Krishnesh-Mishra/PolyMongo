import { PolyMongoConfig } from '../types';
import { ERROR_MESSAGES } from './constants';

/**
 * Validate MongoDB URI format
 */
export function validateMongoURI(uri: string): void {
  if (!uri || typeof uri !== 'string') {
    throw new Error(ERROR_MESSAGES.INVALID_MONGO_URI);
  }

  const mongoURIPattern = /^mongodb(\+srv)?:\/\/.+/;
  if (!mongoURIPattern.test(uri)) {
    throw new Error(ERROR_MESSAGES.INVALID_MONGO_URI);
  }
}

/**
 * Validate database name
 */
export function validateDatabaseName(dbName: string): void {
  if (!dbName || typeof dbName !== 'string' || dbName.trim().length === 0) {
    throw new Error(ERROR_MESSAGES.DB_NAME_REQUIRED);
  }

  // MongoDB database name restrictions
  const invalidChars = /[\/\\. "$*<>:|?]/;
  if (invalidChars.test(dbName)) {
    throw new Error('Database name contains invalid characters');
  }

  if (dbName.length > 64) {
    throw new Error('Database name exceeds 64 character limit');
  }
}

/**
 * Validate priority value
 */
export function validatePriority(priority: number): void {
  if (typeof priority !== 'number' || isNaN(priority)) {
    throw new Error(ERROR_MESSAGES.INVALID_PRIORITY);
  }

  if (priority < -1) {
    throw new Error(ERROR_MESSAGES.INVALID_PRIORITY);
  }
}

/**
 * Validate PolyMongo configuration
 */
export function validateConfig(config: PolyMongoConfig): void {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object');
  }

  // Validate required mongoURI
  validateMongoURI(config.mongoURI);

  // Validate optional fields
  if (config.maxConnections !== undefined) {
    if (
      typeof config.maxConnections !== 'number' ||
      config.maxConnections < 1 ||
      !Number.isInteger(config.maxConnections)
    ) {
      throw new Error('maxConnections must be a positive integer');
    }
  }

  if (config.idleTimeout !== undefined) {
    if (typeof config.idleTimeout !== 'number' || config.idleTimeout < 0) {
      throw new Error('idleTimeout must be a non-negative number');
    }
  }

  if (config.defaultDB !== undefined) {
    validateDatabaseName(config.defaultDB);
  }

  if (config.metadataDB !== undefined) {
    validateDatabaseName(config.metadataDB);
  }

  if (config.evictionType !== undefined) {
    const validTypes = ['manual', 'timeout', 'LRU'];
    if (!validTypes.includes(config.evictionType)) {
      throw new Error(
        `evictionType must be one of: ${validTypes.join(', ')}`
      );
    }
  }

  if (config.cacheConnections !== undefined && typeof config.cacheConnections !== 'boolean') {
    throw new Error('cacheConnections must be a boolean');
  }

  if (config.disconnectOnIdle !== undefined && typeof config.disconnectOnIdle !== 'boolean') {
    throw new Error('disconnectOnIdle must be a boolean');
  }
}

/**
 * Sanitize database name from MongoDB URI
 */
export function sanitizeMongoURI(uri: string): string {
  // Remove database name from URI if present
  const parsed = uri.split('?')[0]; // Remove query params
  const parts = parsed.split('/');
  
  if (parts.length > 3) {
    // Remove database name portion
    return parts.slice(0, 3).join('/');
  }
  
  return uri;
}