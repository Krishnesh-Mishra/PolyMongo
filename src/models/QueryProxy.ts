import { Model, Query, Aggregate, ChangeStream } from 'mongoose';
import { ConnectionManager } from '../core/ConnectionManager';
import { logger } from '../utils/logger';

/**
 * Proxy for handling database selection in query chains
 */
export class QueryProxy {
  private selectedDB: string | null = null;
  private model: Model<any>;
  private connectionManager: ConnectionManager;
  private defaultDB: string;

  constructor(
    model: Model<any>,
    connectionManager: ConnectionManager,
    defaultDB: string
  ) {
    this.model = model;
    this.connectionManager = connectionManager;
    this.defaultDB = defaultDB;
  }

  /**
   * Select database for the next query
   */
  db(dbName: string): this {
    this.selectedDB = dbName;
    return this;
  }

  /**
   * Get the model bound to the selected database
   */
  private async getModelForDB(): Promise<Model<any>> {
    const dbName = this.selectedDB || this.defaultDB;
    const connection = await this.connectionManager.getConnection(dbName);
    
    // Reset selected DB after use
    this.selectedDB = null;
    
    return connection.model(this.model.modelName, this.model.schema);
  }

  /**
   * Wrap a query to use the selected database
   */
  private async wrapQuery<T>(queryFn: (model: Model<any>) => T): Promise<T> {
    const model = await this.getModelForDB();
    return queryFn(model);
  }

  // ============================================
  // Query Methods
  // ============================================

  async find(filter?: any, projection?: any, options?: any): Promise<any[]> {
    return this.wrapQuery(model => model.find(filter, projection, options));
  }

  async findOne(filter?: any, projection?: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findOne(filter, projection, options));
  }

  async findById(id: any, projection?: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findById(id, projection, options));
  }

  async findByIdAndUpdate(id: any, update: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findByIdAndUpdate(id, update, options));
  }

  async findByIdAndDelete(id: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findByIdAndDelete(id, options));
  }

  async findOneAndUpdate(filter: any, update: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findOneAndUpdate(filter, update, options));
  }

  async findOneAndDelete(filter: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findOneAndDelete(filter, options));
  }

  async findOneAndReplace(filter: any, replacement: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.findOneAndReplace(filter, replacement, options));
  }

  // ============================================
  // Create/Insert Methods
  // ============================================

  async create(docs: any | any[], options?: any): Promise<any> {
    return this.wrapQuery(model => model.create(docs, options));
  }

  async insertMany(docs: any[], options?: any): Promise<any[]> {
    return this.wrapQuery(model => model.insertMany(docs, options));
  }

  // ============================================
  // Update Methods
  // ============================================

  async updateOne(filter: any, update: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.updateOne(filter, update, options));
  }

  async updateMany(filter: any, update: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.updateMany(filter, update, options));
  }

  async replaceOne(filter: any, replacement: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.replaceOne(filter, replacement, options));
  }

  // ============================================
  // Delete Methods
  // ============================================

  async deleteOne(filter: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.deleteOne(filter, options));
  }

  async deleteMany(filter: any, options?: any): Promise<any> {
    return this.wrapQuery(model => model.deleteMany(filter, options));
  }

  // ============================================
  // Count/Exists Methods
  // ============================================

  async countDocuments(filter?: any, options?: any): Promise<number> {
    return this.wrapQuery(model => model.countDocuments(filter, options));
  }

  async estimatedDocumentCount(options?: any): Promise<number> {
    return this.wrapQuery(model => model.estimatedDocumentCount(options));
  }

  async exists(filter: any): Promise<boolean> {
    return this.wrapQuery(async model => {
      const result = await model.exists(filter);
      return !!result;
    });
  }

  // ============================================
  // Aggregation
  // ============================================

  async aggregate(pipeline?: any[], options?: any): Promise<any[]> {
    return this.wrapQuery(model => model.aggregate(pipeline, options));
  }

  // ============================================
  // Distinct
  // ============================================

  async distinct(field: string, filter?: any): Promise<any[]> {
    return this.wrapQuery(model => model.distinct(field, filter));
  }

  // ============================================
  // Watch (Change Streams)
  // ============================================

  async watch(pipeline?: any[], options?: any): Promise<ChangeStream> {
    const dbName = this.selectedDB || this.defaultDB;
    const model = await this.getModelForDB();
    
    const stream = model.watch(pipeline, options);
    
    // Register with connection manager
    this.connectionManager.registerWatchStream(dbName, stream);
    
    logger.info(`Watch stream created for ${this.model.modelName} in ${dbName}`);
    
    return stream;
  }

  // ============================================
  // Bulk Operations
  // ============================================

  async bulkWrite(operations: any[], options?: any): Promise<any> {
    return this.wrapQuery(model => model.bulkWrite(operations, options));
  }

  // ============================================
  // Validation
  // ============================================

  async validate(doc: any, pathsToValidate?: string[]): Promise<void> {
    return this.wrapQuery(model => {
      const instance = new model(doc);
      return instance.validate(pathsToValidate);
    });
  }
}