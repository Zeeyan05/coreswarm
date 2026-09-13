/**
 * CoreSwarm Claim Model
 *
 * Each important conclusion from an agent is represented as a structured claim.
 * Confidence represents the originating agent's self-assessment and is NOT proof of verification.
 */

export type ClaimType =
  | 'FACT'
  | 'OBSERVATION'
  | 'INTERPRETATION'
  | 'INFERENCE'
  | 'RECOMMENDATION';

export type ClaimVerificationStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'UNVERIFIED'
  | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE';

export interface Claim {
  readonly claim_id: string; // claim_...
  readonly statement: string;
  readonly type: ClaimType;
  readonly origin_agent: string;
  readonly origin_task_id: string;
  readonly evidence_refs: readonly string[]; // evidence_ids
  readonly confidence: number; // 0.0 .. 1.0 (subjective to origin agent)
  readonly verification_status: ClaimVerificationStatus;
  readonly verified_by?: string; // verifier agent DID or ID
  readonly verification_reason?: string;
  readonly created_at: string;
}
