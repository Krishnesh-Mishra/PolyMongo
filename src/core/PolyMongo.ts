// In src/core/PolyMongo.ts
import { Model } from 'mongoose';
import type { PolyMongoConfig, ResolvedPolyMongoConfig, PolyMongoStats, DatabaseStats } from '../types';
import { ConnectionManager } from './ConnectionManager';
import { MetadataManager } from './MetadataManager';
import { LRUEvictionStrategy } from './EvictionStrategy';
import { QueryProxy, WrappedModel } from '../models/QueryProxy'; // Ensure single import
import { DEFAULT_CONFIG, CONNECTION_STATE } from '../utils/constants';
import { validateConfig, validatePriority, sanitizeMongoURI } from '../utils/validators';
import { logger } from '../utils/logger';


/**
 * Main PolyMongo wrapper class
 * Manages multi-database connections with adaptive eviction and priority-based management
 */
export class PolyMongo {
  private config: ResolvedPolyMongoConfig;
  private connectionManager!: ConnectionManager;
  private metadataManager!: MetadataManager;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: PolyMongoConfig) {
    // Validate configuration
    validateConfig(config);

    // Resolve configuration with defaults
    this.config = this.resolveConfig(config);

    logger.info('PolyMongo instance created', {
      metadataDB: this.config.metadataDB,
      defaultDB: this.config.defaultDB,
      maxConnections: this.config.maxConnections,
      evictionType: this.config.evictionType,
    });
  }

  /**
   * Create a new PolyMongo wrapper instance
   * @deprecated Use `new PolyMongo(config)` instead for lazy initialization
   */
  static async createWrapper(config: PolyMongoConfig): Promise<PolyMongo> {
    const instance = new PolyMongo(config);
    await instance.ensureInitialized();
    return instance;
  }

  /**
   * Ensure the wrapper is initialized (lazy initialization)
   */
  public async ensureInitialized(): Promise<void> {
  if (this.initialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (this.initPromise) {
    return this.initPromise;
  }

  // Start initialization
  this.initPromise = this.initialize();
  await this.initPromise;
  this.initPromise = null;
}

  /**
   * Initialize the wrapper
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('PolyMongo already initialized');
      return;
    }

    try {
      const sanitizedURI = sanitizeMongoURI(this.config.mongoURI);
      this.metadataManager = new MetadataManager(sanitizedURI, this.config.metadataDB);
      await this.metadataManager.initialize();
      
      this.connectionManager = new ConnectionManager(this.config, this.metadataManager);
      
      this.initialized = true;
      logger.info('PolyMongo initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PolyMongo:', error);
      throw error;
    }
  }

  /**
   * Wrap a Mongoose model for multi-database support
   */
// Update wrapModel method
wrapModel<T>(model: Model<T>): WrappedModel<T> {
  logger.debug(`Wrapping model: ${model.modelName}`);
  return new QueryProxy<T>(model, this, this.config.defaultDB);
}
  /**
   * Get connection manager (ensures initialization)
   */
  async getConnectionManager(): Promise<ConnectionManager> {
    await this.ensureInitialized();
    return this.connectionManager;
  }

  /**
   * Set priority for a specific database
   */
  async setPriority(dbName: string, priority: number): Promise<void> {
    await this.ensureInitialized();
    validatePriority(priority);
    await this.connectionManager.setPriority(dbName, priority);
    logger.info(`Priority set to ${priority} for database: ${dbName}`);
  }

  /**
   * Manually open a connection to a database
   */
  async openConnection(dbName: string): Promise<void> {
    await this.ensureInitialized();
    await this.connectionManager.openConnection(dbName);
    logger.info(`Connection opened to database: ${dbName}`);
  }

  /**
   * Manually close a connection to a database
   */
  async closeConnection(dbName: string): Promise<void> {
    await this.ensureInitialized();
    await this.connectionManager.closeConnection(dbName);
    logger.info(`Connection closed to database: ${dbName}`);
  }

  /**
   * Get comprehensive statistics about connections
   */
  async stats(): Promise<PolyMongoStats> {
    await this.ensureInitialized();
    const connections = this.connectionManager.getAllConnections();
    const managerStats = this.connectionManager.getStats();
    const allMetadata = await this.metadataManager.getAllMetadata();

    const databases: DatabaseStats[] = [];
    const now = Date.now();

    for (const [dbName, connInfo] of connections.entries()) {
      const metadata = allMetadata.find(m => m.dbName === dbName) || connInfo.metadata;
      const idleTime = now - connInfo.lastActivity;

      const dbStats: DatabaseStats = {
        dbName,
        isActive: connInfo.connection.readyState === CONNECTION_STATE.CONNECTED,
        state: connInfo.connection.readyState,
        useCount: metadata.useCount,
        lastUsed: metadata.lastUsed,
        idleTime,
        priority: metadata.priority,
        activeWatchStreams: connInfo.watchStreams.size,
        hasActiveWatch: connInfo.watchStreams.size > 0,
        createdAt: metadata.createdAt,
      };

      // Add score if using LRU eviction
      if (this.config.evictionType === 'LRU') {
        const lruStrategy = new LRUEvictionStrategy();
        dbStats.score = lruStrategy.getScore(connInfo);
      }

      databases.push(dbStats);
    }

    // Sort by priority, then by score/idle time
    databases.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.score !== undefined && b.score !== undefined) {
        return b.score - a.score;
      }
      return b.idleTime - a.idleTime;
    });

    const idleConnections = databases.filter(
      db => db.isActive && db.idleTime > this.config.idleTimeout
    ).length;

    return {
      totalConnections: managerStats.totalConnections,
      activeConnections: managerStats.activeConnections,
      idleConnections,
      maxConnections: this.config.maxConnections,
      cacheHits: managerStats.cacheHits,
      cacheMisses: managerStats.cacheMisses,
      evictions: managerStats.evictions,
      evictionType: this.config.evictionType,
      defaultDB: this.config.defaultDB,
      metadataDB: this.config.metadataDB,
      databases,
    };
  }

  /**
   * Close all connections and cleanup
   */
  async close(): Promise<void> {
    if (!this.initialized) {
      logger.warn('PolyMongo not initialized, nothing to close');
      return;
    }

    try {
      logger.info('Closing PolyMongo...');
      await this.connectionManager.closeAll();
      await this.metadataManager.close();
      this.initialized = false;
      logger.info('PolyMongo closed successfully');
    } catch (error) {
      logger.error('Error closing PolyMongo:', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ResolvedPolyMongoConfig {
    return { ...this.config };
  }

  /**
   * Check if wrapper is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Resolve configuration with defaults
   */
  private resolveConfig(config: PolyMongoConfig): ResolvedPolyMongoConfig {
    return {
      mongoURI: config.mongoURI,
      metadataDB: config.metadataDB ?? DEFAULT_CONFIG.METADATA_DB,
      defaultDB: config.defaultDB ?? DEFAULT_CONFIG.DEFAULT_DB,
      idleTimeout: config.idleTimeout ?? DEFAULT_CONFIG.IDLE_TIMEOUT,
      maxConnections: config.maxConnections ?? DEFAULT_CONFIG.MAX_CONNECTIONS,
      cacheConnections: config.cacheConnections ?? DEFAULT_CONFIG.CACHE_CONNECTIONS,
      disconnectOnIdle: config.disconnectOnIdle ?? DEFAULT_CONFIG.DISCONNECT_ON_IDLE,
      evictionType: config.evictionType ?? DEFAULT_CONFIG.EVICTION_TYPE,
      mongooseOptions: config.mongooseOptions,
    };
  }
}

/**
 * Export convenience method for creating wrapper
 */
export default PolyMongo;