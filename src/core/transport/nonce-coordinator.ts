/**
 * CoreSwarm Nonce KV Coordinator
 *
 * Multi-instance nonce coordination via Technocore `/kv/room-nonce/<room>`
 * compare-and-swap. Each sender DID owns a key; the value is the last-used
 * nonce. Before signing, an instance CAS-advances its key past any value a
 * sibling instance wrote, so two processes sharing one DID never collide.
 *
 * Transport-agnostic: constructed with fetch/post callbacks so both direct
 * and proxy modes work. Disabled by default (opt-in via transport config).
 */

export interface KvBackend {
  get(key: string): Promise<string | null>;
  /** CAS write: set key=value only if current===expected (null = must not exist). */
  cas(key: string, expected: string | null, value: string): Promise<boolean>;
}

export class NonceCoordinator {
  readonly #backend: KvBackend;
  readonly #maxRetries: number;

  constructor(backend: KvBackend, maxRetries = 5) {
    this.#backend = backend;
    this.#maxRetries = Math.max(1, maxRetries);
  }

  /**
   * Reserve the next nonce for (room, did): reads the shared watermark,
   * advances past it, and CAS-writes the claim. Returns the reserved nonce.
   * Throws after maxRetries contended attempts.
   */
  async reserve(room: string, did: string, localNext: () => string): Promise<string> {
    const key = `room-nonce/${room}/${encodeURIComponent(did)}`;
    for (let attempt = 0; attempt < this.#maxRetries; attempt++) {
      const current = await this.#backend.get(key).catch(() => null);
      let candidate = localNext();
      if (current !== null && /^\d{1,19}$/.test(current) && BigInt(current) >= BigInt(candidate)) {
        candidate = (BigInt(current) + 1n).toString();
      }
      const won = await this.#backend.cas(key, current, candidate).catch(() => false);
      if (won) return candidate;
    }
    throw new Error(`Nonce CAS contention on '${key}' after ${this.#maxRetries} attempts`);
  }
}

/** In-memory KV backend (single-process default; also used in tests). */
export class MemoryKvBackend implements KvBackend {
  readonly #store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.#store.get(key) ?? null;
  }

  async cas(key: string, expected: string | null, value: string): Promise<boolean> {
    const current = this.#store.get(key) ?? null;
    if (current !== expected) return false;
    this.#store.set(key, value);
    return true;
  }
}
