/**
 * CoreSwarm Agent Identity (Ed25519)
 *
 * Encapsulates private seed in an ES2022 private field (#seed).
 * Provides did:key:z6Mk... identifier and canonical message/envelope signing.
 */

import * as ed from '@noble/ed25519';
import { didFromPublicKey } from './did';
import { base64urlEncode } from './encode';
import { NonceManager } from './nonce';
import { canonicalEnvelopePayload, canonicalMessagePayload } from './canonicalize';
import { sweep } from './sweep';
import type { CoreSwarmEnvelope, CoreSwarmMessageType, ParticipantIdentity } from '../types/protocol';

export class Identity {
  readonly #seed: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly did: string;
  readonly nonceManager: NonceManager;

  private constructor(seed: Uint8Array, publicKey: Uint8Array, did: string) {
    this.#seed = seed;
    this.publicKey = publicKey;
    this.did = did;
    this.nonceManager = new NonceManager();
  }

  /**
   * Generate a fresh random Ed25519 Identity.
   */
  static async generate(): Promise<Identity> {
    const seed = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(seed);
    const did = didFromPublicKey(publicKey);
    return new Identity(seed, publicKey, did);
  }

  /**
   * Restore an Identity from a 32-byte seed.
   */
  static async fromSeed(seed: Uint8Array): Promise<Identity> {
    if (seed.length !== 32) {
      throw new Error(`Expected 32-byte seed, got ${seed.length}`);
    }
    const publicKey = await ed.getPublicKeyAsync(seed);
    const did = didFromPublicKey(publicKey);
    return new Identity(new Uint8Array(seed), publicKey, did);
  }

  /**
   * Export the private seed (e.g. for secure offline backup or testing).
   */
  exportSeed(): Uint8Array {
    return new Uint8Array(this.#seed);
  }

  /**
   * Produce a signed CoreSwarm envelope.
   */
  async signEnvelope<T>(params: {
    message_id: string;
    message_type: CoreSwarmMessageType;
    mission_id: string;
    task_id?: string;
    agent_id: string;
    recipient: ParticipantIdentity;
    payload: T;
    references?: string[];
  }): Promise<CoreSwarmEnvelope<T>> {
    const nonce = this.nonceManager.next();
    const created_at = new Date().toISOString();
    const references = params.references ?? [];

    const canonicalBytes = canonicalEnvelopePayload({
      protocol: 'coreswarm/1',
      message_id: params.message_id,
      message_type: params.message_type,
      mission_id: params.mission_id,
      task_id: params.task_id,
      sender_did: this.did,
      recipient_did: params.recipient.did,
      nonce,
      created_at,
      payload: params.payload,
    });

    const sigBytes = await ed.signAsync(canonicalBytes, this.#seed);
    const signature = base64urlEncode(sigBytes);

    return {
      protocol: 'coreswarm/1',
      message_id: params.message_id,
      message_type: params.message_type,
      mission_id: params.mission_id,
      task_id: params.task_id,
      sender: {
        agent_id: params.agent_id,
        did: this.did,
      },
      recipient: params.recipient,
      created_at,
      nonce,
      payload: params.payload,
      references,
      signature,
    };
  }

  /**
   * Sign a Technocore room message using authentic protocol canonicalization:
   * <room>|<nonce>|<sweptText>
   */
  async signMessage(
    room: string,
    text: string,
  ): Promise<{ sweptText: string; sig: string; nonce: string }> {
    const sweptText = sweep(text);
    const nonce = this.nonceManager.next();
    const payload = canonicalMessagePayload(room, nonce, sweptText);
    const sigBytes = await ed.signAsync(payload, this.#seed);
    const sig = base64urlEncode(sigBytes);
    return { sweptText, sig, nonce };
  }
}
