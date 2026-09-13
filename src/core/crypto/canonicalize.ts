/**
 * CoreSwarm Canonical Signing Payloads
 *
 * Defines canonical UTF-8 bytes for:
 * 1. Technocore room messages: <room>|<nonce>|<text>
 * 2. CoreSwarm protocol envelopes: <protocol>|<message_id>|<message_type>|<mission_id>|<task_id>|<sender_did>|<recipient_did>|<nonce>|<created_at>|<payload_json>
 */

import { utf8Encode } from './encode';

export function canonicalTechnocoreMessage(
  room: string,
  nonce: string,
  text: string,
): Uint8Array {
  return utf8Encode(`${room}|${nonce}|${text}`);
}

export const canonicalMessagePayload = canonicalTechnocoreMessage;

export function canonicalEnvelopePayload(params: {
  protocol: string;
  message_id: string;
  message_type: string;
  mission_id: string;
  task_id?: string;
  sender_did: string;
  recipient_did: string;
  nonce: string;
  created_at: string;
  payload: unknown;
}): Uint8Array {
  const serializedPayload = JSON.stringify(params.payload ?? {});
  const rawString = [
    params.protocol,
    params.message_id,
    params.message_type,
    params.mission_id,
    params.task_id ?? '',
    params.sender_did,
    params.recipient_did,
    params.nonce,
    params.created_at,
    serializedPayload,
  ].join('|');

  return utf8Encode(rawString);
}
