/**
 * CoreSwarm Verification Operations
 *
 * Checks signature syntax, canonical terminal characters ([AQgw]), and Ed25519 cryptographic validity.
 */

import * as ed from '@noble/ed25519';
import { base64urlDecode } from './encode';
import { publicKeyFromDid, isValidDid } from './did';
import { canonicalEnvelopePayload, canonicalMessagePayload } from './canonicalize';
import type { CoreSwarmEnvelope } from '../types/protocol';

export const SIG_LENGTH = 86;
export const SIG_PATTERN = /^[A-Za-z0-9_-]{85}[AQgw]$/;
export const SIG_TERMINAL_CHARS = new Set(['A', 'Q', 'g', 'w']);

export async function rawVerify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export async function verifyEnvelopeSignature(envelope: CoreSwarmEnvelope): Promise<{
  valid: boolean;
  didValid: boolean;
  signatureFormatValid: boolean;
  signatureValid: boolean;
  error?: string;
}> {
  const { sender, signature, nonce, created_at, message_id, message_type, mission_id, task_id, payload } = envelope;

  const didValid = isValidDid(sender.did);
  if (!didValid) {
    return {
      valid: false,
      didValid: false,
      signatureFormatValid: false,
      signatureValid: false,
      error: `Invalid sender DID '${sender.did}'`,
    };
  }

  const signatureFormatValid =
    typeof signature === 'string' &&
    signature.length === SIG_LENGTH &&
    SIG_PATTERN.test(signature);

  if (!signatureFormatValid) {
    return {
      valid: false,
      didValid: true,
      signatureFormatValid: false,
      signatureValid: false,
      error: `Malformed signature format (expected 86 chars ending in [AQgw])`,
    };
  }

  try {
    const publicKey = publicKeyFromDid(sender.did);
    const sigBytes = base64urlDecode(signature);
    const payloadBytes = canonicalEnvelopePayload({
      protocol: envelope.protocol,
      message_id,
      message_type,
      mission_id,
      task_id,
      sender_did: sender.did,
      recipient_did: envelope.recipient.did,
      nonce,
      created_at,
      payload,
    });

    const signatureValid = await rawVerify(sigBytes, payloadBytes, publicKey);

    return {
      valid: signatureValid,
      didValid: true,
      signatureFormatValid: true,
      signatureValid,
      error: signatureValid ? undefined : 'Ed25519 signature mismatch',
    };
  } catch (err) {
    return {
      valid: false,
      didValid: true,
      signatureFormatValid: true,
      signatureValid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verify an authentic Technocore room message:
 * <room>|<nonce>|<text> signed by Ed25519 DID.
 */
export async function verifyRoomMessage(
  room: string,
  message: { did: string; nonce: string; sig: string; text: string },
): Promise<{ valid: boolean; error?: string }> {
  if (!isValidDid(message.did)) return { valid: false, error: 'Invalid DID' };
  if (typeof message.sig !== 'string' || message.sig.length !== 86 || !SIG_PATTERN.test(message.sig)) {
    return { valid: false, error: 'Invalid signature format (expected 86 chars ending in [AQgw])' };
  }
  try {
    const publicKey = publicKeyFromDid(message.did);
    const sigBytes = base64urlDecode(message.sig);
    const payload = canonicalMessagePayload(room, message.nonce, message.text);
    const valid = await rawVerify(sigBytes, payload, publicKey);
    return { valid, error: valid ? undefined : 'Ed25519 signature mismatch' };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
