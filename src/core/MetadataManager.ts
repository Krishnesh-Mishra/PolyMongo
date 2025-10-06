import mongoose, { Connection, Model } from 'mongoose';
import { ConnectionMetadata, MetadataDocument } from '../types';
import { METADATA_COLLECTION, PRIORITY, ERROR_MESSAGES } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Manages connection metadata in MongoDB
 */
export class MetadataManager {
  private connection: Connection | null = null;
  private metadataModel: Model<MetadataDocument> | null = null;
  private metadataDB: string;
  private baseURI: string;

  constructor(baseURI: string, metadataDB: string) {
    this.baseURI = baseURI;
    this.metadataDB = metadataDB;
  }

  /**
   * Initialize metadata database connection
   */
  async initialize(): Promise<void> {
    try {
      const uri = `${this.baseURI}/${this.metadataDB}`;
      this.connection = await mongoose.createConnection(uri).asPromise();

      // Define metadata schema
      const metadataSchema = new mongoose.Schema<MetadataDocument>(
        {
          dbName: { type: String, required: true, unique: true },
          lastUsed: { type: Date, required: true },
          useCount: { type: Number, required: true, default: 0 },
          idleTime: { type: Number, required: true, default: 0 },
          priority: { type: Number, required: true, default: PRIORITY.MEDIUM },
          hasActiveWatch: { type: Boolean, required: true, default: false },
          createdAt: { type: Date, required: true, default: Date.now },
        },
        {
          timestamps: true,
          collection: METADATA_COLLECTION,
        }
      );

      // Create indexes for performance
      metadataSchema.index({ dbName: 1 });
      metadataSchema.index({ priority: 1 });
      metadataSchema.index({ lastUsed: -1 });

      this.metadataModel = this.connection.model<MetadataDocument>(
        METADATA_COLLECTION,
        metadataSchema
      );

      logger.info(`Metadata database initialized: ${this.metadataDB}`);
    } catch (error) {
      logger.error('Failed to initialize metadata database:', error);
      throw new Error(ERROR_MESSAGES.METADATA_INIT_FAILED);
    }
  }

  /**
   * Get or create metadata for a database
   */
  async getMetadata(dbName: string): Promise<ConnectionMetadata> {
    if (!this.metadataModel) {
      throw new Error('Metadata manager not initialized');
    }

    try {
      let metadata = await this.metadataModel.findOne({ dbName }).lean();

      if (!metadata) {
        // Create new metadata
        metadata = await this.metadataModel.create({
          dbName,
          lastUsed: new Date(),
          useCount: 0,
          idleTime: 0,
          priority: PRIORITY.MEDIUM,
          hasActiveWatch: false,
          createdAt: new Date(),
        });
      }

      return this.toConnectionMetadata(metadata);
    } catch (error) {
      logger.error(`Failed to get metadata for ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Update metadata for a database
   */
  async updateMetadata(dbName: string, updates: Partial<ConnectionMetadata>): Promise<void> {
    if (!this.metadataModel) {
      throw new Error('Metadata manager not initialized');
    }

    try {
      await this.metadataModel.updateOne(
        { dbName },
        { $set: updates },
        { upsert: true }
      );

      logger.debug(`Metadata updated for ${dbName}:`, updates);
    } catch (error) {
      logger.error(`Failed to update metadata for ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Increment use count for a database
   */
  async incrementUseCount(dbName: string): Promise<void> {
    if (!this.metadataModel) {
      throw new Error('Metadata manager not initialized');
    }

    try {
      await this.metadataModel.updateOne(
        { dbName },
        {
          $inc: { useCount: 1 },
          $set: { lastUsed: new Date(), idleTime: 0 },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error(`Failed to increment use count for ${dbName}:`, error);
    }
  }

  /**
   * Update priority for a database
   */
  async setPriority(dbName: string, priority: number): Promise<void> {
    await this.updateMetadata(dbName, { priority });
    logger.info(`Priority set to ${priority} for ${dbName}`);
  }

  /**
   * Set watch status for a database
   */
  async setWatchStatus(dbName: string, hasActiveWatch: boolean): Promise<void> {
    await this.updateMetadata(dbName, { hasActiveWatch });
  }

  /**
   * Delete metadata for a database
   */
  async deleteMetadata(dbName: string): Promise<void> {
    if (!this.metadataModel) {
      throw new Error('Metadata manager not initialized');
    }

    try {
      await this.metadataModel.deleteOne({ dbName });
      logger.debug(`Metadata deleted for ${dbName}`);
    } catch (error) {
      logger.error(`Failed to delete metadata for ${dbName}:`, error);
    }
  }

  /**
   * Get all metadata
   */
  async getAllMetadata(): Promise<ConnectionMetadata[]> {
    if (!this.metadataModel) {
      throw new Error('Metadata manager not initialized');
    }

    try {
      const docs = await this.metadataModel.find().lean();
      return docs.map(doc => this.toConnectionMetadata(doc));
    } catch (error) {
      logger.error('Failed to get all metadata:', error);
      return [];
    }
  }

  /**
   * Close metadata database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.metadataModel = null;
      logger.info('Metadata database connection closed');
    }
  }

  /**
   * Convert metadata document to ConnectionMetadata
   */
  private toConnectionMetadata(doc: MetadataDocument): ConnectionMetadata {
    return {
      dbName: doc.dbName,
      lastUsed: doc.lastUsed,
      useCount: doc.useCount,
      idleTime: doc.idleTime,
      priority: doc.priority,
      hasActiveWatch: doc.hasActiveWatch,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}