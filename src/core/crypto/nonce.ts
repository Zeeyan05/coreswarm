/**
 * CoreSwarm Monotonic Nonce Manager
 *
 * Guarantees strictly increasing nonces across concurrent operations.
 * Nonce format: 1..19 digits decimal.
 */

export class NonceManager {
  #lastNonce: bigint = 0n;

  /**
   * Generates a guaranteed monotonic nonce.
   */
  next(): string {
    const nowMicros = BigInt(Date.now()) * 1000n;
    if (nowMicros > this.#lastNonce) {
      this.#lastNonce = nowMicros;
    } else {
      this.#lastNonce += 1n;
    }
    return this.#lastNonce.toString();
  }

  /**
   * Inspect current high watermark.
   */
  get current(): string {
    return this.#lastNonce.toString();
  }

  /**
   * Restore a previously persisted high watermark (e.g. after a restart).
   * Prevents the receiver's replay guard from rejecting legitimate messages
   * as "nonce regression" when this process restarts within the same
   * millisecond as a pre-restart burst. Throws on malformed input.
   */
  restore(watermark: string): void {
    if (!/^[0-9]{1,19}$/.test(watermark)) {
      throw new Error(`Invalid nonce watermark '${watermark}' (expected 1..19 digits)`);
    }
    const value = BigInt(watermark);
    if (value > this.#lastNonce) {
      this.#lastNonce = value;
    }
  }
}
