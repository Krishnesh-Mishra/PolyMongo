import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import type { ResolvedPolyMongoConfig, ConnectionInfo } from '../types';
import { MetadataManager } from './MetadataManager';
import { IEvictionStrategy, EvictionStrategyFactory } from './EvictionStrategy';
import { ERROR_MESSAGES, PRIORITY, CONNECTION_STATE } from '../utils/constants';
import { logger } from '../utils/logger';
import { validateDatabaseName } from '../utils/validators';

// Type for ChangeStream - using any since it's not exported in mongoose types
type ChangeStream = any;

/**
 * Manages database connections lifecycle
 */
export class ConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private metadataManager: MetadataManager;
  private evictionStrategy: IEvictionStrategy;
  private config: ResolvedPolyMongoConfig;
  private cacheHits = 0;
  private cacheMisses = 0;
  private evictions = 0;

  constructor(config: ResolvedPolyMongoConfig, metadataManager: MetadataManager) {
    this.config = config;
    this.metadataManager = metadataManager;
    this.evictionStrategy = EvictionStrategyFactory.create(
      config.evictionType,
      config.idleTimeout
    );
  }

  /**
   * Get or create a connection to a database
   */
  async getConnection(dbName: string): Promise<Connection> {
    validateDatabaseName(dbName);

    // Check cache first
    if (this.config.cacheConnections && this.connections.has(dbName)) {
      const connInfo = this.connections.get(dbName)!;
      
      if (connInfo.connection.readyState === CONNECTION_STATE.CONNECTED) {
        this.cacheHits++;
        await this.recordActivity(dbName);
        return connInfo.connection;
      }
    }

    this.cacheMisses++;

    // Check if we need to evict before creating new connection
    await this.enforceMaxConnections();

    // Create new connection
    return await this.createConnection(dbName);
  }

  /**
   * Create a new database connection
   */
  private async createConnection(dbName: string): Promise<Connection> {
    try {
      const uri = `${this.config.mongoURI}/${dbName}`;
      logger.info(`Creating connection to ${dbName}`);

      const connection = await mongoose.createConnection(uri, this.config.mongooseOptions).asPromise();

      // Get or create metadata
      const metadata = await this.metadataManager.getMetadata(dbName);

      // Store connection info
      const connInfo: ConnectionInfo = {
        connection,
        watchStreams: new Set(),
        metadata,
        lastActivity: Date.now(),
      };

      this.connections.set(dbName, connInfo);

      // Setup idle timeout if configured
      if (this.config.disconnectOnIdle && this.config.evictionType === 'timeout') {
        this.setupIdleTimeout(dbName);
      }

      logger.info(`Connection established to ${dbName}`);
      return connection;
    } catch (error) {
      logger.error(`Failed to create connection to ${dbName}:`, error);
      throw new Error(`${ERROR_MESSAGES.CONNECTION_FAILED}: ${dbName}`);
    }
  }

  /**
   * Enforce maximum connection limit
   */
  private async enforceMaxConnections(): Promise<void> {
    if (!this.config.maxConnections) {
      return; // Unlimited connections
    }

    const activeCount = this.getActiveConnectionCount();
    const watchCount = this.getWatchConnectionCount();

    // Allow temporary excess for watch connections
    if (activeCount >= this.config.maxConnections) {
      // Calculate how many to evict (subtract watch count for temporary allowance)
      const evictCount = Math.max(1, activeCount - this.config.maxConnections + 1 - watchCount);
      
      logger.warn(`Max connections (${this.config.maxConnections}) reached. Evicting ${evictCount} connection(s)`);
      
      const toEvict = this.evictionStrategy.selectForEviction(this.connections, evictCount);
      
      if (toEvict.length === 0) {
        logger.error('No connections available for eviction');
        throw new Error(ERROR_MESSAGES.MAX_CONNECTIONS_EXCEEDED);
      }

      for (const dbName of toEvict) {
        await this.closeConnection(dbName);
      }
    }
  }

  /**
   * Record activity on a connection
   */
  private async recordActivity(dbName: string): Promise<void> {
    const connInfo = this.connections.get(dbName);
    if (!connInfo) return;

    connInfo.lastActivity = Date.now();
    
    // Update metadata
    await this.metadataManager.incrementUseCount(dbName);

    // Reset idle timeout
    if (connInfo.idleTimeoutHandle) {
      clearTimeout(connInfo.idleTimeoutHandle);
      this.setupIdleTimeout(dbName);
    }
  }

  /**
   * Setup idle timeout for a connection
   */
  private setupIdleTimeout(dbName: string): void {
    const connInfo = this.connections.get(dbName);
    if (!connInfo) return;

    // Clear existing timeout
    if (connInfo.idleTimeoutHandle) {
      clearTimeout(connInfo.idleTimeoutHandle);
    }

    // Don't set timeout for priority -1 or watched connections
    if (connInfo.metadata.priority === PRIORITY.NEVER_CLOSE || connInfo.watchStreams.size > 0) {
      return;
    }

    connInfo.idleTimeoutHandle = setTimeout(() => {
      this.handleIdleTimeout(dbName);
    }, this.config.idleTimeout);
  }

  /**
   * Handle idle timeout
   */
  private async handleIdleTimeout(dbName: string): Promise<void> {
    const connInfo = this.connections.get(dbName);
    if (!connInfo) return;

    const now = Date.now();
    if (this.evictionStrategy.shouldEvict(connInfo, now)) {
      logger.info(`Connection to ${dbName} idle timeout reached`);
      await this.closeConnection(dbName);
    }
  }

  /**
   * Close a specific connection
   */
  async closeConnection(dbName: string): Promise<void> {
    const connInfo = this.connections.get(dbName);
    if (!connInfo) {
      logger.warn(`Cannot close ${dbName}: connection not found`);
      return;
    }

    try {
      // Close all watch streams first
      for (const stream of connInfo.watchStreams) {
        await stream.close();
      }
      connInfo.watchStreams.clear();

      // Clear idle timeout
      if (connInfo.idleTimeoutHandle) {
        clearTimeout(connInfo.idleTimeoutHandle);
      }

      // Close connection
      await connInfo.connection.close();
      this.connections.delete(dbName);
      this.evictions++;

      logger.info(`Connection to ${dbName} closed`);
    } catch (error) {
      logger.error(`Error closing connection to ${dbName}:`, error);
    }
  }

  /**
   * Open a connection manually
   */
  async openConnection(dbName: string): Promise<Connection> {
    return await this.getConnection(dbName);
  }

  /**
   * Register a watch stream
   */
  registerWatchStream(dbName: string, stream: ChangeStream): void {
    const connInfo = this.connections.get(dbName);
    if (!connInfo) {
      logger.warn(`Cannot register watch stream for ${dbName}: connection not found`);
      return;
    }

    connInfo.watchStreams.add(stream);
    this.metadataManager.setWatchStatus(dbName, true);

    // Clear idle timeout while watch is active
    if (connInfo.idleTimeoutHandle) {
      clearTimeout(connInfo.idleTimeoutHandle);
      connInfo.idleTimeoutHandle = undefined;
    }

    logger.info(`Watch stream registered for ${dbName}`);

    // Setup cleanup on stream close
    stream.on('close', () => {
      this.unregisterWatchStream(dbName, stream);
    });
  }

  /**
   * Unregister a watch stream
   */
  private unregisterWatchStream(dbName: string, stream: ChangeStream): void {
    const connInfo = this.connections.get(dbName);
    if (!connInfo) return;

    connInfo.watchStreams.delete(stream);

    if (connInfo.watchStreams.size === 0) {
      this.metadataManager.setWatchStatus(dbName, false);
      
      // Resume idle timeout if configured
      if (this.config.disconnectOnIdle && this.config.evictionType === 'timeout') {
        this.setupIdleTimeout(dbName);
      }
      
      logger.info(`Watch stream unregistered for ${dbName}`);
    }
  }

  /**
   * Set priority for a database
   */
  async setPriority(dbName: string, priority: number): Promise<void> {
    await this.metadataManager.setPriority(dbName, priority);

    const connInfo = this.connections.get(dbName);
    if (connInfo) {
      connInfo.metadata.priority = priority;
    }
  }

  /**
   * Get active connection count
   */
  private getActiveConnectionCount(): number {
    let count = 0;
    for (const connInfo of this.connections.values()) {
      if (connInfo.connection.readyState === CONNECTION_STATE.CONNECTED) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get watch connection count
   */
  private getWatchConnectionCount(): number {
    let count = 0;
    for (const connInfo of this.connections.values()) {
      if (connInfo.watchStreams.size > 0) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all connections
   */
  getAllConnections(): Map<string, ConnectionInfo> {
    return this.connections;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      evictions: this.evictions,
      activeConnections: this.getActiveConnectionCount(),
      totalConnections: this.connections.size,
    };
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    logger.info('Closing all connections');
    
    const closePromises = Array.from(this.connections.keys()).map(dbName =>
      this.closeConnection(dbName)
    );

    await Promise.all(closePromises);
  }
}