/**
 * Statistics for a single database connection
 */
export interface DatabaseStats {
  /**
   * Database name
   */
  dbName: string;

  /**
   * Whether connection is currently active
   */
  isActive: boolean;

  /**
   * Connection state (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)
   */
  state: number;

  /**
   * Total number of queries executed
   */
  useCount: number;

  /**
   * Last used timestamp
   */
  lastUsed: Date;

  /**
   * Current idle time in milliseconds
   */
  idleTime: number;

  /**
   * Priority level
   */
  priority: number;

  /**
   * Number of active watch streams
   */
  activeWatchStreams: number;

  /**
   * Whether connection has active watch streams
   */
  hasActiveWatch: boolean;

  /**
   * Adaptive score (for LRU eviction)
   */
  score?: number;

  /**
   * Connection creation timestamp
   */
  createdAt: Date;
}

/**
 * Overall PolyMongo statistics
 */
export interface PolyMongoStats {
  /**
   * Total number of connections managed
   */
  totalConnections: number;

  /**
   * Number of currently active connections
   */
  activeConnections: number;

  /**
   * Number of idle connections
   */
  idleConnections: number;

  /**
   * Maximum connections allowed (undefined = unlimited)
   */
  maxConnections?: number;

  /**
   * Total cache hits
   */
  cacheHits: number;

  /**
   * Total cache misses
   */
  cacheMisses: number;

  /**
   * Total evictions performed
   */
  evictions: number;

  /**
   * Current eviction type
   */
  evictionType: string;

  /**
   * Default database name
   */
  defaultDB: string;

  /**
   * Metadata database name
   */
  metadataDB: string;

  /**
   * Per-database statistics
   */
  databases: DatabaseStats[];
}