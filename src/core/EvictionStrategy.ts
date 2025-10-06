import { ConnectionInfo, EvictionType } from '../types';
import { ScoringEngine } from './ScoringEngine';
import { logger } from '../utils/logger';

/**
 * Base eviction strategy interface
 */
export interface IEvictionStrategy {
  shouldEvict(connInfo: ConnectionInfo, now: number): boolean;
  selectForEviction(connections: Map<string, ConnectionInfo>, count: number): string[];
}

/**
 * Manual eviction strategy - only evict when explicitly called
 */
export class ManualEvictionStrategy implements IEvictionStrategy {
  shouldEvict(): boolean {
    return false;
  }

  selectForEviction(): string[] {
    return [];
  }
}

/**
 * Timeout-based eviction strategy
 */
export class TimeoutEvictionStrategy implements IEvictionStrategy {
  constructor(private idleTimeout: number) {}

  shouldEvict(connInfo: ConnectionInfo, now: number): boolean {
    // Don't evict priority -1 or watched connections
    if (connInfo.metadata.priority === -1 || connInfo.watchStreams.size > 0) {
      return false;
    }

    const idleTime = now - connInfo.lastActivity;
    return idleTime >= this.idleTimeout;
  }

  selectForEviction(connections: Map<string, ConnectionInfo>, count: number): string[] {
    const now = Date.now();
    const candidates: Array<{ dbName: string; idleTime: number }> = [];

    for (const [dbName, connInfo] of connections.entries()) {
      if (this.shouldEvict(connInfo, now)) {
        const idleTime = now - connInfo.lastActivity;
        candidates.push({ dbName, idleTime });
      }
    }

    // Sort by idle time (longest first)
    candidates.sort((a, b) => b.idleTime - a.idleTime);

    return candidates.slice(0, count).map(c => c.dbName);
  }
}

/**
 * LRU (Least Recently Used) with adaptive scoring
 */
export class LRUEvictionStrategy implements IEvictionStrategy {
  private scoringEngine: ScoringEngine;

  constructor() {
    this.scoringEngine = new ScoringEngine();
  }

  shouldEvict(connInfo: ConnectionInfo): boolean {
    // Never auto-evict priority -1 or watched connections
    if (connInfo.metadata.priority === -1 || connInfo.watchStreams.size > 0) {
      return false;
    }

    return true;
  }

  selectForEviction(connections: Map<string, ConnectionInfo>, count: number): string[] {
    return this.scoringEngine.selectForEviction(connections, count);
  }

  /**
   * Get connection score
   */
  getScore(connInfo: ConnectionInfo): number {
    return this.scoringEngine.calculateScore(connInfo);
  }
}

/**
 * Factory for creating eviction strategies
 */
export class EvictionStrategyFactory {
  static create(type: EvictionType, idleTimeout: number): IEvictionStrategy {
    switch (type) {
      case 'manual':
        logger.info('Using manual eviction strategy');
        return new ManualEvictionStrategy();
      
      case 'timeout':
        logger.info(`Using timeout eviction strategy (${idleTimeout}ms)`);
        return new TimeoutEvictionStrategy(idleTimeout);
      
      case 'LRU':
        logger.info('Using LRU eviction strategy with adaptive scoring');
        return new LRUEvictionStrategy();
      
      default:
        throw new Error(`Unknown eviction type: ${type}`);
    }
  }
}