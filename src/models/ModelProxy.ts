import { ConnectionInfo } from '../types';
import { SCORING_WEIGHTS, PRIORITY } from '../utils/constants';
import { logger } from '../utils/logger';

/**
 * Scoring engine for adaptive connection management
 * Implements the formula: score = useCount / avgInterval - idleTime / 1000 + priorityWeight
 */
export class ScoringEngine {
  /**
   * Calculate adaptive score for a connection
   */
  calculateScore(connInfo: ConnectionInfo): number {
    const { metadata, lastActivity } = connInfo;
    const now = Date.now();
    const idleTime = now - lastActivity;

    // Calculate average interval between uses
    const lifetimeMs = now - new Date(metadata.createdAt).getTime();
    const avgInterval = metadata.useCount > 0 ? lifetimeMs / metadata.useCount : lifetimeMs;

    // Calculate priority weight
    const priorityWeight = this.calculatePriorityWeight(metadata.priority);

    // Calculate base score
    const useCountScore = metadata.useCount / Math.max(avgInterval, 1);
    const idleTimeScore = idleTime * SCORING_WEIGHTS.IDLE_TIME_WEIGHT;

    const score = useCountScore - idleTimeScore + priorityWeight;

    logger.debug(`Score calculation for ${metadata.dbName}:`, {
      useCount: metadata.useCount,
      avgInterval,
      idleTime,
      priority: metadata.priority,
      priorityWeight,
      score,
    });

    return score;
  }

  /**
   * Calculate priority weight
   * -1 priority gets a very high score (protected)
   * Lower numeric priority gets higher weight
   */
  private calculatePriorityWeight(priority: number): number {
    if (priority === PRIORITY.NEVER_CLOSE) {
      return Number.MAX_SAFE_INTEGER / 2; // Very high but not infinite
    }

    // Inverse relationship: lower priority number = higher weight
    return SCORING_WEIGHTS.PRIORITY_BASE_WEIGHT / (priority + 1);
  }

  /**
   * Find connections eligible for eviction
   * Returns sorted array (lowest score first)
   */
  findEvictionCandidates(
    connections: Map<string, ConnectionInfo>,
    excludeWatched: boolean = true
  ): Array<{ dbName: string; score: number; info: ConnectionInfo }> {
    const candidates: Array<{ dbName: string; score: number; info: ConnectionInfo }> = [];

    for (const [dbName, connInfo] of connections.entries()) {
      // Skip connections with active watch streams if requested
      if (excludeWatched && connInfo.watchStreams.size > 0) {
        continue;
      }

      // Skip priority -1 connections unless absolutely necessary
      if (connInfo.metadata.priority === PRIORITY.NEVER_CLOSE && excludeWatched) {
        continue;
      }

      const score = this.calculateScore(connInfo);
      candidates.push({ dbName, score, info: connInfo });
    }

    // Sort by score (lowest first = most eligible for eviction)
    candidates.sort((a, b) => a.score - b.score);

    logger.debug('Eviction candidates:', candidates.map(c => ({
      dbName: c.dbName,
      score: c.score,
      priority: c.info.metadata.priority,
      hasWatch: c.info.watchStreams.size > 0,
    })));

    return candidates;
  }

  /**
   * Select connections to evict based on count needed
   */
  selectForEviction(
    connections: Map<string, ConnectionInfo>,
    count: number
  ): string[] {
    if (count <= 0) {
      return [];
    }

    // First try without watched connections
    let candidates = this.findEvictionCandidates(connections, true);

    // If not enough candidates, include watched connections
    if (candidates.length < count) {
      logger.warn('Not enough non-watched connections for eviction, including watched connections');
      candidates = this.findEvictionCandidates(connections, false);
    }

    return candidates.slice(0, count).map(c => c.dbName);
  }

  /**
   * Get score for a specific connection
   */
  getConnectionScore(connInfo: ConnectionInfo): number {
    return this.calculateScore(connInfo);
  }
}