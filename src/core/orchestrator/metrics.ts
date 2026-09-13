/**
 * CoreSwarm Observability Metrics
 *
 * Tracks REAL measured metrics. No fabricated numbers.
 */

export interface SystemMetrics {
  missionDurationMs: number;
  taskDurations: Record<string, number>;
  agentLatencies: Record<string, number[]>;
  taskFailures: number;
  timeouts: number;
  retries: number;
  verificationOutcomes: {
    verified: number;
    partiallyVerified: number;
    contradicted: number;
    insufficientEvidence: number;
  };
  disputeCount: number;
  evidenceCount: number;
  messageCount: number;
}

export class MetricsTracker {
  #startTime = 0;
  #endTime = 0;
  #taskStartTimes = new Map<string, number>();
  #taskDurations: Record<string, number> = {};
  #agentLatencies: Record<string, number[]> = {};
  #taskFailures = 0;
  #timeouts = 0;
  #retries = 0;
  #verificationOutcomes = {
    verified: 0,
    partiallyVerified: 0,
    contradicted: 0,
    insufficientEvidence: 0,
  };
  #disputeCount = 0;
  #evidenceCount = 0;
  #messageCount = 0;

  startMission(): void {
    this.#startTime = performance.now();
  }

  endMission(): void {
    this.#endTime = performance.now();
  }

  recordMessage(): void {
    this.#messageCount++;
  }

  startTask(taskId: string): void {
    this.#taskStartTimes.set(taskId, performance.now());
  }

  completeTask(taskId: string, agentId: string): void {
    const start = this.#taskStartTimes.get(taskId);
    if (start !== undefined) {
      const duration = Math.round(performance.now() - start);
      this.#taskDurations[taskId] = duration;

      if (!this.#agentLatencies[agentId]) {
        this.#agentLatencies[agentId] = [];
      }
      this.#agentLatencies[agentId].push(duration);
    }
  }

  recordFailure(): void {
    this.#taskFailures++;
  }

  recordTimeout(): void {
    this.#timeouts++;
  }

  recordRetry(): void {
    this.#retries++;
  }

  recordVerificationOutcome(status: string): void {
    switch (status) {
      case 'VERIFIED':
        this.#verificationOutcomes.verified++;
        break;
      case 'PARTIALLY_VERIFIED':
        this.#verificationOutcomes.partiallyVerified++;
        break;
      case 'CONTRADICTED':
        this.#verificationOutcomes.contradicted++;
        break;
      case 'INSUFFICIENT_EVIDENCE':
        this.#verificationOutcomes.insufficientEvidence++;
        break;
    }
  }

  recordDispute(): void {
    this.#disputeCount++;
  }

  recordEvidenceCount(count: number): void {
    this.#evidenceCount += count;
  }

  /** Reset all counters for a fresh mission run. */
  reset(): void {
    this.#startTime = 0;
    this.#endTime = 0;
    this.#taskStartTimes.clear();
    this.#taskDurations = {};
    this.#agentLatencies = {};
    this.#taskFailures = 0;
    this.#timeouts = 0;
    this.#retries = 0;
    this.#verificationOutcomes = {
      verified: 0,
      partiallyVerified: 0,
      contradicted: 0,
      insufficientEvidence: 0,
    };
    this.#disputeCount = 0;
    this.#evidenceCount = 0;
    this.#messageCount = 0;
  }

  getSnapshot(): SystemMetrics {
    const duration = this.#endTime > 0
      ? Math.round(this.#endTime - this.#startTime)
      : this.#startTime > 0
      ? Math.round(performance.now() - this.#startTime)
      : 0;

    return {
      missionDurationMs: duration,
      taskDurations: { ...this.#taskDurations },
      agentLatencies: { ...this.#agentLatencies },
      taskFailures: this.#taskFailures,
      timeouts: this.#timeouts,
      retries: this.#retries,
      verificationOutcomes: { ...this.#verificationOutcomes },
      disputeCount: this.#disputeCount,
      evidenceCount: this.#evidenceCount,
      messageCount: this.#messageCount,
    };
  }
}
