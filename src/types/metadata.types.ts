import type { Connection } from 'mongoose';

// Type for ChangeStream - using any since it's not exported in mongoose types
type ChangeStream = any;

/**
 * Connection metadata stored in the metadata database
 */
export interface ConnectionMetadata {
  /**
   * Database name
   */
  dbName: string;

  /**
   * Timestamp of last use
   */
  lastUsed: Date;

  /**
   * Total number of times this connection was used
   */
  useCount: number;

  /**
   * Current idle time in milliseconds
   */
  idleTime: number;

  /**
   * Priority level (-1 = never close, 0 = highest, larger = lower)
   */
  priority: number;

  /**
   * Whether a watch stream is active on this connection
   */
  hasActiveWatch: boolean;

  /**
   * Timestamp when connection was created
   */
  createdAt: Date;

  /**
   * Timestamp when metadata was last updated
   */
  updatedAt: Date;
}

/**
 * In-memory connection info
 */
export interface ConnectionInfo {
  /**
   * Mongoose connection instance
   */
  connection: Connection;

  /**
   * Active watch streams on this connection
   */
  watchStreams: Set<ChangeStream>;

  /**
   * Connection metadata
   */
  metadata: ConnectionMetadata;

  /**
   * Timestamp of last activity
   */
  lastActivity: number;

  /**
   * Idle timeout handle
   */
  idleTimeoutHandle?: NodeJS.Timeout;
}

/**
 * Metadata document structure in MongoDB
 */
export interface MetadataDocument extends ConnectionMetadata {
  _id?: string;
}