/**
 * CoreSwarm WebSocket Transport
 *
 * Push-based alternative to long-polling: subscribes to room streams over a
 * single socket instead of one HTTP request per room per 5s window.
 * Same verification pipeline as TechnocoreTransport: schema → replay guard →
 * inner signature → required outer signature.
 *
 * Wire protocol (JSON frames):
 *   client → server: { action: "subscribe" | "unsubscribe", room }
 *   client → server: { action: "publish", room, message: { did, sig, nonce, text } | { from, text } }
 *   server → client: { room, seq, did?, sig?, nonce?, from?, text }
 *
 * Falls back gracefully: send failures throw (caller retries); socket drops
 * reconnect with backoff and resubscribe automatically.
 */

import type { Transport, EnvelopeHandler } from './transport-interface';
import type { CoreSwarmEnvelope } from '../types/protocol';
import { Identity } from '../crypto/identity';
import { sweep } from '../crypto/sweep';
import { verifyRoomMessage, verifyEnvelopeSignature } from '../crypto/verify';
import { CoreSwarmEnvelopeSchema } from '../protocol/validator';
import { ReplayGuard } from '../protocol/replay-guard';

export interface WebSocketTransportConfig {
  readonly url: string; // e.g. wss://technocore.chat/ws or /api/ws proxy
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
}

interface IncomingFrame {
  room?: unknown;
  seq?: unknown;
  did?: unknown;
  sig?: unknown;
  nonce?: unknown;
  from?: unknown;
  text?: unknown;
}

export class WebSocketTransport implements Transport {
  readonly replayGuard = new ReplayGuard();
  readonly #url: string;
  readonly #reconnectBaseMs: number;
  readonly #reconnectMaxMs: number;
  readonly #identities = new Map<string, Identity>();
  readonly #subscribers = new Map<string, Set<EnvelopeHandler>>();
  #socket: WebSocket | null = null;
  #running = true;
  #reconnectAttempt = 0;
  #connectPromise: Promise<void> | null = null;

  constructor(config: WebSocketTransportConfig) {
    this.#url = config.url;
    this.#reconnectBaseMs = config.reconnectBaseMs ?? 1000;
    this.#reconnectMaxMs = config.reconnectMaxMs ?? 30_000;
  }

  registerIdentity(identity: Identity): void {
    this.#identities.set(identity.did, identity);
  }

  async sendEnvelope(room: string, envelope: CoreSwarmEnvelope): Promise<void> {
    const swept = sweep(JSON.stringify(envelope));
    if (swept.length > 4096) {
      throw new Error(`CoreSwarm envelope exceeds Technocore 4096 character limit (${swept.length} chars)`);
    }
    const identity = this.#identities.get(envelope.sender.did);
    const resolved = identity
      ? await identity.signMessage(room, swept).then((s) => ({ did: identity.did, sig: s.sig, nonce: s.nonce, text: s.sweptText }))
      : { from: envelope.sender.did, text: swept };

    await this.#ensureConnected();
    const payload = JSON.stringify({ action: 'publish', room, message: resolved });
    await new Promise<void>((resolve, reject) => {
      try {
        this.#socket!.send(payload);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  subscribe(room: string, handler: EnvelopeHandler): () => void {
    if (!this.#subscribers.has(room)) {
      this.#subscribers.set(room, new Set());
      void this.#ensureConnected().then(() => this.#sendFrame({ action: 'subscribe', room })).catch(() => undefined);
    }
    this.#subscribers.get(room)!.add(handler);
    return () => {
      this.#subscribers.get(room)?.delete(handler);
      if (this.#subscribers.get(room)?.size === 0) {
        this.#subscribers.delete(room);
        this.#sendFrame({ action: 'unsubscribe', room });
      }
    };
  }

  async disconnect(): Promise<void> {
    this.#running = false;
    this.#subscribers.clear();
    try {
      this.#socket?.close();
    } catch {
      // ignore
    }
    this.#socket = null;
    this.#connectPromise = null;
  }

  #sendFrame(frame: Record<string, unknown>): void {
    try {
      if (this.#socket && this.#socket.readyState === WebSocket.OPEN) {
        this.#socket.send(JSON.stringify(frame));
      }
    } catch {
      // Reconnect loop will resubscribe.
    }
  }

  #ensureConnected(): Promise<void> {
    if (this.#socket && this.#socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (!this.#connectPromise) {
      this.#connectPromise = this.#connect().finally(() => {
        this.#connectPromise = null;
      });
    }
    return this.#connectPromise;
  }

  async #connect(): Promise<void> {
    if (!this.#running) throw new Error('Transport disconnected');
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.#url);
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch { /* ignore */ }
          reject(new Error(`WebSocket connect timeout (${this.#url})`));
        }
      }, 15_000);
      (timeout as unknown as { unref?: () => void }).unref?.();

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.#socket = ws;
        this.#reconnectAttempt = 0;
        this.#attachHandlers(ws);
        // Resubscribe to all rooms after (re)connect
        for (const room of this.#subscribers.keys()) {
          this.#sendFrame({ action: 'subscribe', room });
        }
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket error (${this.#url})`));
        }
      };
      ws.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket closed before open (${this.#url})`));
        }
      };
    }).catch((err) => {
      if (!this.#running) throw err;
      // Backoff + retry in the background; the awaiting caller gets the error
      // and may retry send/subscribe (which re-enters ensureConnected).
      this.#reconnectAttempt++;
      const delay = Math.min(
        this.#reconnectMaxMs,
        this.#reconnectBaseMs * 2 ** Math.min(8, this.#reconnectAttempt),
      );
      setTimeout(() => {
        if (this.#running && this.#subscribers.size > 0) void this.#ensureConnected().catch(() => undefined);
      }, delay);
      throw err;
    });

    // Attach close handler for established sockets (reconnect on drop)
    if (this.#socket) {
      const ws = this.#socket;
      const prevClose = ws.onclose;
      ws.onclose = (ev) => {
        if (typeof prevClose === 'function') prevClose.call(ws, ev);
        this.#socket = null;
        if (!this.#running || this.#subscribers.size === 0) return;
        this.#reconnectAttempt++;
        const delay = Math.min(
          this.#reconnectMaxMs,
          this.#reconnectBaseMs * 2 ** Math.min(8, this.#reconnectAttempt),
        );
        setTimeout(() => {
          if (this.#running && this.#subscribers.size > 0) void this.#ensureConnected().catch(() => undefined);
        }, delay);
      };
    }
  }

  #attachHandlers(ws: WebSocket): void {
    ws.onmessage = (event) => {
      void (async () => {
        let frame: IncomingFrame;
        try {
          frame = JSON.parse(String(event.data)) as IncomingFrame;
        } catch {
          return;
        }
        const { room, text } = frame;
        if (typeof room !== 'string' || typeof text !== 'string') return;
        const handlers = this.#subscribers.get(room);
        if (!handlers || handlers.size === 0) return;

        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return;
        }
        if (!raw || (raw as CoreSwarmEnvelope).protocol !== 'coreswarm/1') return;

        const schemaResult = CoreSwarmEnvelopeSchema.safeParse(raw);
        if (!schemaResult.success) return;
        const parsed = schemaResult.data as unknown as CoreSwarmEnvelope;

        if (!this.replayGuard.validateEnvelope(parsed).ok) return;
        const inner = await verifyEnvelopeSignature(parsed);
        if (!inner.valid) return;

        const senderDid = typeof frame.did === 'string' && frame.did.startsWith('did:key:')
          ? frame.did
          : typeof frame.from === 'string' && frame.from.startsWith('did:key:') ? frame.from : undefined;
        if (typeof frame.sig === 'string' && senderDid && frame.nonce !== undefined) {
          const outer = await verifyRoomMessage(room, {
            did: senderDid,
            sig: frame.sig,
            nonce: String(frame.nonce),
            text,
          });
          if (!outer.valid) return;
        } else if (senderDid) {
          return;
        }

        for (const h of handlers) {
          try {
            await h(parsed, room);
          } catch (err) {
            console.error(`Error delivering websocket envelope to room '${room}':`, err);
          }
        }
      })();
    };
  }
}
