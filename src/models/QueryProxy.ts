import type { Model } from 'mongoose';
import type { PolyMongo } from '../core/PolyMongo';
import { logger } from '../utils/logger';

/**
 * Proxy for handling database selection in query chains
 */
export class QueryProxy {
  private selectedDB: string | null = null;
  private model: Model<any>;
  private wrapper: PolyMongo;
  private defaultDB: string;

  constructor(
    model: Model<any>,
    wrapper: PolyMongo,
    defaultDB: string
  ) {
    this.model = model;
    this.wrapper = wrapper;
    this.defaultDB = defaultDB;

    // Return a Proxy that intercepts all method calls
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Handle 'db' method specially
        if (prop === 'db') {
          return (dbName: string) => {
            target.selectedDB = dbName;
            return receiver;
          };
        }

        // For all other properties/methods, return a function that:
        // 1. Gets the model for the selected DB
        // 2. Calls the method on that model
        // 3. Returns the result (which might be a Query with chainable methods)
        const originalProp = Reflect.get(target, prop, receiver);
        
        if (typeof originalProp !== 'undefined') {
          return originalProp;
        }

        // If the property doesn't exist on QueryProxy, assume it's a Mongoose method
        return function(...args: any[]) {
          return target.executeOnModel(prop as string, args);
        };
      }
    });
  }

  /**
   * Execute a method on the model for the selected database
   */
  private async executeOnModel(method: string, args: any[]): Promise<any> {
    const dbName = this.selectedDB || this.defaultDB;
    this.selectedDB = null; // Reset after capturing

    const connectionManager = await this.wrapper.getConnectionManager();
    const connection = await connectionManager.getConnection(dbName);
    const model = connection.model(this.model.modelName, this.model.schema);

    // Check if it's a special method that needs watch stream registration
    if (method === 'watch') {
      const stream = (model as any)[method](...args);
      connectionManager.registerWatchStream(dbName, stream);
      logger.info(`Watch stream created for ${this.model.modelName} in ${dbName}`);
      return stream;
    }

    // Call the method on the model
    const result = (model as any)[method](...args);
    return result;
  }
}