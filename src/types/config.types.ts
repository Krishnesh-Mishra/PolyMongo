/**
 * Eviction strategy types
 */
export type EvictionType = 'manual' | 'timeout' | 'LRU';

/**
 * PolyMongo configuration options
 */
export interface PolyMongoConfig {
  /**
   * MongoDB URI (host + port only, database portion is ignored)
   * @example "mongodb://localhost:27017"
   */
  mongoURI: string;

  /**
   * Database name for storing connection metadata
   * @default "polymongo-metadata"
   */
  metadataDB?: string;

  /**
   * Maximum number of simultaneous database connections
   * @default undefined (unlimited)
   */
  maxConnections?: number;

  /**
   * Default database name when .db() is not called
   * @default "Default-DB"
   */
  defaultDB?: string;

  /**
   * Idle timeout in milliseconds for timeout-based eviction
   * @default 60000 (60 seconds)
   */
  idleTimeout?: number;

  /**
   * Whether to cache and reuse existing connections
   * @default true
   */
  cacheConnections?: boolean;

  /**
   * Whether to disconnect idle databases
   * @default true
   */
  disconnectOnIdle?: boolean;

  /**
   * Eviction strategy type
   * @default "LRU"
   */
  evictionType?: EvictionType;

  /**
   * Additional mongoose connection options
   */
  mongooseOptions?: Record<string, any>;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedPolyMongoConfig extends Required<Omit<PolyMongoConfig, 'maxConnections' | 'mongooseOptions'>> {
  maxConnections?: number;
  mongooseOptions?: Record<string, any>;
}