import { Model, Query, Aggregate } from 'mongoose';
import type { PolyMongo } from '../core/PolyMongo';
import { logger } from '../utils/logger';

/**
 * Create proxy for handling database-specific execution in query chains
 */
function createChainProxy<Target extends Query<any, any> | Aggregate<any>>(
  target: Target,
  wrapper: PolyMongo,
  dbName: string
): Target {
  const handler = {
    get(proxyTarget: { target: Target; wrapper: PolyMongo; dbName: string }, prop: string | symbol, receiver: any) {
      const value = Reflect.get(proxyTarget.target, prop);

      if (typeof value === 'function') {
        return (...args: any[]) => {
          if (['exec', 'then', 'catch', 'finally'].includes(prop as string)) {
            return (async () => {
              await proxyTarget.wrapper.ensureInitialized();
              const connManager = await proxyTarget.wrapper.getConnectionManager();
              const connection = await connManager.getConnection(proxyTarget.dbName);

              let model;
              if (proxyTarget.target instanceof Query) {
                model = proxyTarget.target.model;
              } else if (proxyTarget.target instanceof Aggregate) {
                model = (proxyTarget.target as any)._model;
              } else {
                throw new Error('Unsupported target type');
              }

              const dbModel = connection.model(model.modelName, model.schema);

              if (proxyTarget.target instanceof Query) {
                (proxyTarget.target as any)._collection = dbModel.collection; // Type assertion
              } else if (proxyTarget.target instanceof Aggregate) {
                (proxyTarget.target as any)._model = dbModel; // Type assertion
              }

              return value.apply(proxyTarget.target, args);
            })();
          } else {
            const result = value.apply(proxyTarget.target, args);
            // Return new proxy for chainable methods that return Query or Aggregate
            if (result instanceof Query || result instanceof Aggregate) {
              return createChainProxy(result, proxyTarget.wrapper, proxyTarget.dbName);
            }
            // Return receiver for methods that return the same Query instance (e.g., where(), select())
            if (result === proxyTarget.target) {
              return receiver;
            }
            // Return result for non-chainable methods
            return result;
          }
        };
      }
      return value;
    }
  };

  return new Proxy({ target, wrapper, dbName }, handler) as unknown as Target;
}

/**
 * Proxy for handling database selection and model methods
 */
export const QueryProxy = function<T = any>(
  model: Model<T>,
  wrapper: PolyMongo,
  defaultDB: string
): WrappedModel<T> {
  const handler = {
    get(proxyTarget: { selectedDB: string | null; model: Model<T>; wrapper: PolyMongo; defaultDB: string }, prop: string | symbol, receiver: any) {
      if (prop === 'db') {
        return (dbName: string) => {
          proxyTarget.selectedDB = dbName;
          return receiver;
        };
      }

      if (prop === 'selectedDB' || prop === 'model' || prop === 'wrapper' || prop === 'defaultDB') {
        return Reflect.get(proxyTarget, prop);
      }

      return (...args: any[]) => {
        return (async () => {
          await proxyTarget.wrapper.ensureInitialized();
          const dbName = proxyTarget.selectedDB || proxyTarget.defaultDB;
          proxyTarget.selectedDB = null;
          const connectionManager = await proxyTarget.wrapper.getConnectionManager();
          const connection = await connectionManager.getConnection(dbName);
          const dbModel = connection.model<T>(proxyTarget.model.modelName, proxyTarget.model.schema);

          const tempResult = (dbModel as any)[prop](...args);

          if (tempResult instanceof Query || tempResult instanceof Aggregate) {
            return createChainProxy(tempResult, proxyTarget.wrapper, dbName);
          }

          if (prop === 'watch') {
            const stream = tempResult;
            connectionManager.registerWatchStream(dbName, stream);
            logger.info(`Watch stream created for ${proxyTarget.model.modelName} in ${dbName}`);
            return stream;
          }

          return tempResult;
        })();
      };
    }
  };

  return new Proxy({ selectedDB: null, model, wrapper, defaultDB }, handler) as unknown as WrappedModel<T>;
} as unknown as { new <T = any>(model: Model<T>, wrapper: PolyMongo, defaultDB: string): WrappedModel<T> };

export type WrappedModel<T> = Model<T> & {
  db(dbName: string): WrappedModel<T>;
};