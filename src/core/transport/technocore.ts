/**
 * CoreSwarm Technocore Transport Adapter
 *
 * Implements authentic Technocore protocol semantics:
 * - Packages envelopes into swept single-line messages (<= 4096 chars)
 * - Transmits over cryptographically signed Technocore rooms (did, sig, nonce, text)
 * - Uses Ed25519 multibase did:key and canonical <room>|<nonce>|<text> payloads
 * - Streams incoming messages via long polling (/r/<room>?format=json&wait=5)
 * - Dual mode: Direct Node.js HTTP or Browser /api/proxy
 */

import type { Transport, EnvelopeHandler } from './transport-interface';
import type { CoreSwarmEnvelope } from '../types/protocol';
import { Identity } from '../crypto/identity';
import { sweep } from '../crypto/sweep';
import { verifyRoomMessage, verifyEnvelopeSignature } from '../crypto/verify';
import { CoreSwarmEnvelopeSchema } from '../protocol/validator';
import { ReplayGuard } from '../protocol/replay-guard';
import type { NonceCoordinator } from './nonce-coordinator';

export interface TechnocoreTransportConfig {
  readonly baseUrl?: string; // Direct URL (e.g. https://technocore.chat)
  readonly proxyEndpoint?: string; // Proxy URL (e.g. /api/proxy)
  /** Opt-in multi-instance nonce coordination (see nonce-coordinator.ts). */
  readonly nonceCoordinator?: NonceCoordinator;
}

export class TechnocoreTransport implements Transport {
  readonly #baseUrl?: string;
  readonly #proxyEndpoint?: string;
  readonly #identities = new Map<string, Identity>();
  readonly #subscribers = new Map<string, Set<EnvelopeHandler>>();
  readonly #abortControllers = new Map<string, AbortController>();
  readonly replayGuard = new ReplayGuard();
  readonly #nonceCoordinator?: NonceCoordinator;
  #running = true;

  constructor(config: TechnocoreTransportConfig = {}) {
    this.#baseUrl = config.baseUrl;
    this.#proxyEndpoint = config.proxyEndpoint ?? (typeof window !== 'undefined' ? '/api/proxy' : undefined);
    this.#nonceCoordinator = config.nonceCoordinator;
  }

  /**
   * Register an agent's Identity for authentic Ed25519 room signing.
   */
  registerIdentity(identity: Identity): void {
    this.#identities.set(identity.did, identity);
  }

  /**
   * Resolve target URL based on whether proxy or direct baseUrl is configured.
   */
  #buildUrl(pathWithQuery: string): string {
    if (this.#proxyEndpoint) {
      const [path, query] = pathWithQuery.split('?');
      const queryPart = query ? `&${query}` : '';
      return `${this.#proxyEndpoint}?path=${encodeURIComponent(path!)}${queryPart}`;
    }
    const base = this.#baseUrl ?? 'https://technocore.chat';
    return `${base}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
  }

  /**
   * Post an authentic, Ed25519 signed message to a Technocore room.
   */
  async sendEnvelope(room: string, envelope: CoreSwarmEnvelope): Promise<void> {
    const rawJson = JSON.stringify(envelope);
    const swept = sweep(rawJson);

    if (swept.length > 4096) {
      throw new Error(`CoreSwarm envelope exceeds Technocore 4096 character limit (${swept.length} chars)`);
    }

    const identity = this.#identities.get(envelope.sender.did);
    let requestBody: Record<string, unknown>;

    if (identity) {
      // Authentic Technocore Ed25519 room signing: <room>|<nonce>|<sweptText>
      // With multi-instance coordination, reserve the nonce via CAS first so
      // sibling processes sharing this DID cannot collide.
      let signResult = await identity.signMessage(room, swept);
      if (this.#nonceCoordinator) {
        const reserved = await this.#nonceCoordinator.reserve(room, identity.did, () => identity.nonceManager.next());
        identity.nonceManager.restore(reserved);
        signResult = await identity.signMessage(room, swept);
        // Guard against a local-manager race producing a different nonce than reserved.
        if (BigInt(signResult.nonce) < BigInt(reserved)) {
          identity.nonceManager.restore(reserved);
          signResult = await identity.signMessage(room, swept);
        }
      }
      requestBody = {
        did: identity.did,
        sig: signResult.sig,
        nonce: signResult.nonce,
        text: signResult.sweptText,
      };
    } else {
      // Fallback if identity secret is not held on this node
      requestBody = {
        from: envelope.sender.did,
        text: swept,
      };
    }

    const url = this.#buildUrl(`/r/${encodeURIComponent(room)}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Technocore transport send failed (${res.status}): ${errText}`);
    }
  }

  subscribe(room: string, handler: EnvelopeHandler): () => void {
    if (!this.#subscribers.has(room)) {
      this.#subscribers.set(room, new Set());
      this.#startPolling(room);
    }
    this.#subscribers.get(room)!.add(handler);

    return () => {
      this.#subscribers.get(room)?.delete(handler);
      if (this.#subscribers.get(room)?.size === 0) {
        this.#stopPolling(room);
      }
    };
  }

  #startPolling(room: string): void {
    const controller = new AbortController();
    this.#abortControllers.set(room, controller);

    (async () => {
      let since: number | undefined;

      while (this.#running && !controller.signal.aborted) {
        try {
          const params = new URLSearchParams({ format: 'json', wait: '5' });
          if (since !== undefined) params.set('since', since.toString());

          const url = this.#buildUrl(`/r/${encodeURIComponent(room)}?${params.toString()}`);
          const res = await fetch(url, { signal: controller.signal });

          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }

          const data = await res.json();
          if (data && Array.isArray(data.messages)) {
            // Track max seq so out-of-order batches can't regress the cursor.
            let maxSeq = since;
            for (const msg of data.messages) {
              if (typeof msg.seq === 'number' && (maxSeq === undefined || msg.seq > maxSeq)) {
                maxSeq = msg.seq;
              }
              try {
                if (typeof msg.text !== 'string') continue;
                // Parse inner coreswarm/1 envelope
                const raw = JSON.parse(msg.text) as unknown;
                if (!raw || (raw as CoreSwarmEnvelope).protocol !== 'coreswarm/1') continue;

                // 1. Schema validation (reject malformed envelopes with a diagnostic)
                const schemaResult = CoreSwarmEnvelopeSchema.safeParse(raw);
                if (!schemaResult.success) {
                  console.warn(`[TechnocoreTransport] Discarding seq ${msg.seq}: schema invalid (${schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')})`);
                  continue;
                }
                const parsed = schemaResult.data as unknown as CoreSwarmEnvelope;

                // 2. Replay guard: duplicate IDs, nonce regression, timestamp drift
                const replayCheck = this.replayGuard.validateEnvelope(parsed);
                if (!replayCheck.ok) {
                  console.warn(`[TechnocoreTransport] Discarding envelope ${parsed.message_id}: ${replayCheck.reason}`);
                  continue;
                }

                // 3. Verify inner envelope signature
                const innerVerify = await verifyEnvelopeSignature(parsed);
                if (!innerVerify.valid) {
                  console.warn(`[TechnocoreTransport] Discarding envelope ${parsed.message_id}: invalid envelope signature`);
                  continue;
                }

                // 4. Outer Technocore signature is REQUIRED when present fields allow
                // verification; unsigned room chatter claiming a DID is rejected.
                const senderDid = msg.did ?? (typeof msg.from === 'string' && msg.from.startsWith('did:key:') ? msg.from : undefined);
                if (msg.sig && senderDid && msg.nonce) {
                  const outerVerify = await verifyRoomMessage(room, {
                    did: senderDid,
                    sig: msg.sig,
                    nonce: String(msg.nonce),
                    text: msg.text,
                  });
                  if (!outerVerify.valid) {
                    console.warn(`[TechnocoreTransport] Discarding seq ${msg.seq}: outer Technocore signature invalid (${outerVerify.error})`);
                    continue;
                  }
                } else if (senderDid) {
                  console.warn(`[TechnocoreTransport] Discarding seq ${msg.seq}: DID-claiming message without outer signature`);
                  continue;
                }

                const handlers = this.#subscribers.get(room);
                if (handlers) {
                  for (const h of handlers) {
                    await h(parsed, room);
                  }
                }
              } catch (err) {
                // JSON parse or unexpected shape: log once, keep polling.
                console.warn(`[TechnocoreTransport] Skipping unparsable message on seq ${msg?.seq}: ${(err as Error)?.message ?? String(err)}`);
              }
            }
            since = maxSeq;
          }
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') break;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
  }

  #stopPolling(room: string): void {
    const controller = this.#abortControllers.get(room);
    if (controller) {
      controller.abort();
      this.#abortControllers.delete(room);
    }
    this.#subscribers.delete(room);
  }

  async disconnect(): Promise<void> {
    this.#running = false;
    for (const controller of this.#abortControllers.values()) {
      controller.abort();
    }
    this.#abortControllers.clear();
    this.#subscribers.clear();
  }
}
