/**
 * CoreSwarm Verification and Dispute Types
 */

import type { ClaimVerificationStatus } from './claims';
import type { Evidence } from './evidence';

export interface VerificationDecision {
  readonly claim_id: string;
  readonly status: ClaimVerificationStatus;
  readonly reason: string;
  readonly evidence_refs: readonly string[];
  readonly verifier: string;
  readonly created_at: string;
}

export type DisputeStatus = 'OPEN' | 'EVIDENCE_REQUESTED' | 'RESOLVED';

export type DisputeResolutionOutcome =
  | 'SUPPORTED_A'
  | 'SUPPORTED_B'
  | 'PARTIALLY_SUPPORTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNRESOLVED';

export interface Dispute {
  readonly dispute_id: string; // disp_...
  readonly mission_id: string;
  readonly claim_id: string;
  /** Second claim in the contradiction pair (preserved for side-by-side UI). */
  readonly counter_claim_id?: string;
  readonly claimant_agent: string;
  readonly challenger_agent: string;
  readonly reason: string;
  readonly counter_evidence: readonly Evidence[];
  readonly status: DisputeStatus;
  readonly outcome?: DisputeResolutionOutcome;
  readonly adjudication?: string;
  readonly resolved_at?: string;
  readonly created_at: string;
}

export interface RevisionRequest {
  readonly task_id: string;
  readonly reason: string;
  readonly required_adjustments: readonly string[];
  readonly requested_by: string;
  readonly created_at: string;
}
