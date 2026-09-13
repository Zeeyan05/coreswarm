/**
 * CoreSwarm Transport Abstraction
 *
 * Separates protocol messaging from the underlying network wire transport.
 */

import type { CoreSwarmEnvelope } from '../types/protocol';

export type EnvelopeHandler = (envelope: CoreSwarmEnvelope, room: string) => Promise<void> | void;

export interface Transport {
  /**
   * Broadcast or send a signed CoreSwarm envelope to a room.
   */
  sendEnvelope(room: string, envelope: CoreSwarmEnvelope): Promise<void>;

  /**
   * Subscribe to incoming envelopes in a room.
   */
  subscribe(room: string, handler: EnvelopeHandler): () => void;

  /**
   * Disconnect or release transport resources.
   */
  disconnect(): Promise<void>;
}
