/**
 * PolyMongo - Adaptive Multi-Database Wrapper for Mongoose
 * 
 * @module polymongo
 * @description Seamless multi-database support for Mongoose with intelligent connection management
 */

// Core classes
export { PolyMongo } from './core/PolyMongo';
export { ConnectionManager } from './core/ConnectionManager';
export { MetadataManager } from './core/MetadataManager';
export {
  IEvictionStrategy,
  ManualEvictionStrategy,
  TimeoutEvictionStrategy,
  LRUEvictionStrategy,
  EvictionStrategyFactory,
} from './core/EvictionStrategy';
export { ScoringEngine } from './core/ScoringEngine';

// Models
export { QueryProxy } from './models/QueryProxy';

// Types
export type {
  PolyMongoConfig,
  ResolvedPolyMongoConfig,
  EvictionType,
  ConnectionMetadata,
  MetadataDocument,
  ConnectionInfo,
  PolyMongoStats,
  DatabaseStats,
} from './types';

// Utilities
export { logger, Logger, LogLevel } from './utils/logger';
export {
  validateMongoURI,
  validateDatabaseName,
  validatePriority,
  validateConfig,
  sanitizeMongoURI,
} from './utils/validators';
export {
  DEFAULT_CONFIG,
  METADATA_COLLECTION,
  PRIORITY,
  CONNECTION_STATE,
  EVICTION_TYPES,
  SCORING_WEIGHTS,
  ERROR_MESSAGES,
} from './utils/constants';

// Default export
import { PolyMongo } from './core/PolyMongo';
export default PolyMongo;