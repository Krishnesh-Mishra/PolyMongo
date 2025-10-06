/**
 * Default configuration constants for PolyMongo
 */
export const DEFAULT_CONFIG = {
  METADATA_DB: 'polymongo-metadata',
  DEFAULT_DB: 'Default-DB',
  IDLE_TIMEOUT: 60000, // 60 seconds
  MAX_CONNECTIONS: undefined, // unlimited
  CACHE_CONNECTIONS: true,
  DISCONNECT_ON_IDLE: true,
  EVICTION_TYPE: 'LRU' as const,
} as const;

/**
 * Metadata collection name
 */
export const METADATA_COLLECTION = 'connection_metadata';

/**
 * Priority levels
 */
export const PRIORITY = {
  NEVER_CLOSE: -1,
  HIGHEST: 0,
  HIGH: 100,
  MEDIUM: 500,
  LOW: 1000,
  LOWEST: 10000,
} as const;

/**
 * Connection states
 */
export const CONNECTION_STATE = {
  DISCONNECTED: 0,
  CONNECTED: 1,
  CONNECTING: 2,
  DISCONNECTING: 3,
} as const;

/**
 * Eviction types
 */
export const EVICTION_TYPES = {
  MANUAL: 'manual',
  TIMEOUT: 'timeout',
  LRU: 'LRU',
} as const;

/**
 * Scoring weights for LRU algorithm
 */
export const SCORING_WEIGHTS = {
  USE_COUNT_WEIGHT: 1,
  IDLE_TIME_WEIGHT: 0.001,
  PRIORITY_BASE_WEIGHT: 1000,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  INVALID_MONGO_URI: 'Invalid MongoDB URI provided',
  CONNECTION_FAILED: 'Failed to establish database connection',
  METADATA_INIT_FAILED: 'Failed to initialize metadata database',
  MODEL_NOT_WRAPPED: 'Model must be wrapped with wrapModel() before use',
  INVALID_PRIORITY: 'Priority must be a number >= -1',
  DB_NAME_REQUIRED: 'Database name is required',
  MAX_CONNECTIONS_EXCEEDED: 'Maximum connection limit would be exceeded',
} as const;