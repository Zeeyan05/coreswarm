/**
 * CoreSwarm In-Memory Transport
 *
 * Lightning-fast pub-sub transport for deterministic simulation, offline testing, and local runs.
 */

import type { Transport, EnvelopeHandler } from './transport-interface';
import type { CoreSwarmEnvelope } from '../types/protocol';

export class InMemoryTransport implements Transport {
  readonly #subscribers = new Map<string, Set<EnvelopeHandler>>();
  readonly #history: Array<{ room: string; envelope: CoreSwarmEnvelope }> = [];

  async sendEnvelope(room: string, envelope: CoreSwarmEnvelope): Promise<void> {
    this.#history.push({ room, envelope });
    const handlers = this.#subscribers.get(room);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(envelope, room);
        } catch (err) {
          console.error(`Error delivering in-memory envelope to room '${room}':`, err);
        }
      }
    }
  }

  subscribe(room: string, handler: EnvelopeHandler): () => void {
    if (!this.#subscribers.has(room)) {
      this.#subscribers.set(room, new Set());
    }
    this.#subscribers.get(room)!.add(handler);
    return () => {
      this.#subscribers.get(room)?.delete(handler);
    };
  }

  getHistory(): ReadonlyArray<{ room: string; envelope: CoreSwarmEnvelope }> {
    return this.#history;
  }

  clearHistory(): void {
    this.#history.length = 0;
  }

  async disconnect(): Promise<void> {
    this.#subscribers.clear();
  }
}
