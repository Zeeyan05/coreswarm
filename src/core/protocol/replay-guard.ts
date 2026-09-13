/**
 * CoreSwarm Replay Protection Guard
 *
 * Enforces replay protection:
 * 1. Rejects duplicate message IDs.
 * 2. Rejects stale or duplicate nonces per sender DID.
 * 3. Enforces timestamp drift limits (default 5 minutes).
 * 4. Idempotency protection for results and task state updates.
 */

import type { CoreSwarmEnvelope } from '../types/protocol';

export class ReplayGuard {
  readonly #seenMessageIds = new Set<string>();
  readonly #lastNonces = new Map<string, bigint>();
  readonly #processedResults = new Set<string>();
  readonly #maxDriftMs: number;

  constructor(maxDriftMs = 300_000) { // 5 minutes
    this.#maxDriftMs = maxDriftMs;
  }

  /**
   * Verify whether an incoming message envelope is legitimate and not a replay.
   */
  validateEnvelope(envelope: CoreSwarmEnvelope): { ok: boolean; reason?: string } {
    const { message_id, sender, nonce, created_at } = envelope;

    // 1. Check duplicate message_id
    if (this.#seenMessageIds.has(message_id)) {
      return { ok: false, reason: `Duplicate message_id '${message_id}' (replay detected)` };
    }

    // 2. Check timestamp drift
    const msgTime = Date.parse(created_at);
    if (isNaN(msgTime)) {
      return { ok: false, reason: `Malformed timestamp '${created_at}'` };
    }

    const now = Date.now();
    if (Math.abs(now - msgTime) > this.#maxDriftMs) {
      return { ok: false, reason: `Message timestamp out of acceptable window (${this.#maxDriftMs}ms)` };
    }

    // 3. Monotonic nonce check per sender DID
    try {
      const currentNonce = BigInt(nonce);
      const lastNonce = this.#lastNonces.get(sender.did);
      if (lastNonce !== undefined && currentNonce <= lastNonce) {
        return {
          ok: false,
          reason: `Nonce regression or replay: received ${currentNonce} <= previous ${lastNonce} for ${sender.did}`,
        };
      }
      this.#lastNonces.set(sender.did, currentNonce);
    } catch {
      return { ok: false, reason: `Invalid nonce format '${nonce}'` };
    }

    // Record as seen
    this.#seenMessageIds.add(message_id);

    return { ok: true };
  }

  /**
   * Check idempotency for task result submission.
   */
  recordResultSubmission(resultId: string): boolean {
    if (this.#processedResults.has(resultId)) {
      return false; // already processed
    }
    this.#processedResults.add(resultId);
    return true;
  }

  /**
   * Reset the cache (e.g. for testing or isolated simulations).
   */
  clear(): void {
    this.#seenMessageIds.clear();
    this.#lastNonces.clear();
    this.#processedResults.clear();
  }
}
