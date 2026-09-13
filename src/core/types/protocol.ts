/**
 * CoreSwarm Protocol Types (coreswarm/1)
 *
 * Defines the wire protocol envelope, message types, and participant identity shapes
 * for autonomous agent coordination over Technocore.
 */

export const CORESWARM_PROTOCOL = 'coreswarm/1';

export type CoreSwarmMessageType =
  | 'TASK_REQUEST'
  | 'TASK_ACCEPT'
  | 'TASK_REJECT'
  | 'TASK_PROGRESS'
  | 'TASK_RESULT'
  | 'EVIDENCE_REQUEST'
  | 'EVIDENCE_RESPONSE'
  | 'VERIFICATION'
  | 'DISPUTE'
  | 'REVISION_REQUEST'
  | 'TASK_REASSIGN'
  | 'FINAL_RESULT';

export interface ParticipantIdentity {
  readonly agent_id: string;
  readonly did: string; // did:key:z6Mk...
}

export interface CoreSwarmEnvelope<T = unknown> {
  readonly protocol: typeof CORESWARM_PROTOCOL;
  readonly message_id: string; // msg_...
  readonly message_type: CoreSwarmMessageType;
  readonly mission_id: string; // mission_...
  readonly task_id?: string; // task_...
  readonly sender: ParticipantIdentity;
  readonly recipient: ParticipantIdentity;
  readonly created_at: string; // ISO 8601
  readonly nonce: string; // monotonic digit string
  readonly payload: T;
  readonly references: readonly string[]; // related message_ids / claim_ids / result_ids
  readonly signature: string; // 86-char base64url Ed25519 signature
}
