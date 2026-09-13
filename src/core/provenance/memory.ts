/**
 * CoreSwarm Memory Architecture
 *
 * Separates memory into:
 * 1. Working Memory: Temporary task execution context.
 * 2. Shared Mission Memory: Explicitly shared information across agents.
 * 3. Provenance Memory: Immutable, append-only historical event log.
 */

import type { CoreSwarmEvent } from '../types/events';
import { ProvenanceGraph } from './provenance-graph';

export class WorkingMemory {
  readonly #store = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.#store.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.#store.get(key) as T | undefined;
  }

  clear(): void {
    this.#store.clear();
  }
}

export class SharedMissionMemory {
  readonly #sharedData = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.#sharedData.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.#sharedData.get(key) as T | undefined;
  }

  toObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.#sharedData) {
      obj[k] = v;
    }
    return obj;
  }
}

export class ProvenanceMemory {
  readonly #events: CoreSwarmEvent[] = [];
  readonly graph = new ProvenanceGraph();

  /**
   * Append-only event append.
   */
  appendEvent(event: CoreSwarmEvent): void {
    this.#events.push(Object.freeze({ ...event }));
  }

  /**
   * Bulk-load events from a verified persistence import.
   * Only use with data that passed importMission cross-checks.
   */
  loadEvents(events: readonly CoreSwarmEvent[]): void {
    this.#events.length = 0;
    for (const e of events) {
      this.#events.push(Object.freeze({ ...e }));
    }
  }

  getEventCount(): number {
    return this.#events.length;
  }

  getEvents(): readonly CoreSwarmEvent[] {
    return this.#events;
  }

  getEventsForTask(taskId: string): CoreSwarmEvent[] {
    return this.#events.filter((e) => e.task_id === taskId);
  }
}
