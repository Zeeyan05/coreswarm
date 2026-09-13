/**
 * CoreSwarm DID Operations (Ed25519)
 *
 * Implements did:key:z6Mk... multicodec ed25519-pub (0xed01).
 * Exactly 56 characters.
 */

import { base58btcEncode, base58btcDecode } from './encode';

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);
const DID_KEY_PREFIX = 'did:key:z';

export const DID_LENGTH = 56;
export const DID_PATTERN = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;

export function didFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`Expected 32-byte Ed25519 public key, got ${publicKey.length} bytes`);
  }

  const multicodecKey = new Uint8Array(34);
  multicodecKey.set(ED25519_MULTICODEC_PREFIX);
  multicodecKey.set(publicKey, 2);

  const encoded = base58btcEncode(multicodecKey);
  return `did:key:z${encoded}`;
}

export function publicKeyFromDid(did: string): Uint8Array {
  validateDid(did);

  const encoded = did.slice(DID_KEY_PREFIX.length);
  const decoded = base58btcDecode(encoded);

  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(`DID does not contain valid Ed25519 multicodec key (expected 0xed01 prefix)`);
  }

  return decoded.slice(2);
}

export function validateDid(did: string): void {
  if (typeof did !== 'string' || did.length !== DID_LENGTH || !DID_PATTERN.test(did)) {
    throw new Error(`Invalid Technocore DID '${did}'. Must be 56-char did:key:z6Mk...`);
  }
}

export function isValidDid(did: string): boolean {
  return typeof did === 'string' && did.length === DID_LENGTH && DID_PATTERN.test(did);
}
