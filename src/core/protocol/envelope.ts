/**
 * CoreSwarm Envelope Builder and Parser
 */

import { CoreSwarmEnvelopeSchema } from './validator';
import { verifyEnvelopeSignature } from '../crypto/verify';
import { ReplayGuard } from './replay-guard';
import type { CoreSwarmEnvelope } from '../types/protocol';

export interface ParseResult<T = unknown> {
  readonly success: boolean;
  readonly envelope?: CoreSwarmEnvelope<T>;
  readonly error?: string;
}

export class ProtocolHandler {
  readonly replayGuard: ReplayGuard;

  constructor(replayGuard?: ReplayGuard) {
    this.replayGuard = replayGuard ?? new ReplayGuard();
  }

  /**
   * Validate, check replay, and cryptographically verify an incoming envelope.
   */
  async parseAndVerify<T = Record<string, unknown>>(raw: unknown): Promise<ParseResult<T>> {
    // 1. Zod schema validation
    const schemaResult = CoreSwarmEnvelopeSchema.safeParse(raw);
    if (!schemaResult.success) {
      return {
        success: false,
        error: `Envelope schema validation failed: ${schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      };
    }

    const envelope = schemaResult.data as unknown as CoreSwarmEnvelope<T>;

    // 2. Replay attack guard
    const replayCheck = this.replayGuard.validateEnvelope(envelope as CoreSwarmEnvelope);
    if (!replayCheck.ok) {
      return {
        success: false,
        error: `Replay guard rejected message: ${replayCheck.reason}`,
      };
    }

    // 3. Cryptographic signature check
    const sigCheck = await verifyEnvelopeSignature(envelope as CoreSwarmEnvelope);
    if (!sigCheck.valid) {
      return {
        success: false,
        error: `Cryptographic signature verification failed: ${sigCheck.error}`,
      };
    }

    return {
      success: true,
      envelope,
    };
  }
}
