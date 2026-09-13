/**
 * CoreSwarm Protocol Zod Schemas
 *
 * Enforces strict runtime validation for the coreswarm/1 protocol envelope
 * and all 12 message types.
 */

import { z } from 'zod';
import { DID_PATTERN, SIG_PATTERN } from '../crypto/index';

export const ParticipantIdentitySchema = z.object({
  agent_id: z.string().min(1),
  did: z.string().regex(DID_PATTERN, 'Must be valid did:key:z6Mk... (56 chars)'),
});

// Envelope Schema
export const CoreSwarmEnvelopeSchema = z.object({
  protocol: z.literal('coreswarm/1'),
  message_id: z.string().startsWith('msg_'),
  message_type: z.enum([
    'TASK_REQUEST',
    'TASK_ACCEPT',
    'TASK_REJECT',
    'TASK_PROGRESS',
    'TASK_RESULT',
    'EVIDENCE_REQUEST',
    'EVIDENCE_RESPONSE',
    'VERIFICATION',
    'DISPUTE',
    'REVISION_REQUEST',
    'TASK_REASSIGN',
    'FINAL_RESULT',
  ]),
  mission_id: z.string().startsWith('mission_'),
  task_id: z.string().startsWith('task_').optional(),
  sender: ParticipantIdentitySchema,
  recipient: ParticipantIdentitySchema,
  created_at: z.string().datetime(),
  nonce: z.string().regex(/^[0-9]{1,19}$/, 'Nonce must be 1..19 digits'),
  payload: z.record(z.unknown()),
  references: z.array(z.string()),
  signature: z.string().regex(SIG_PATTERN, 'Signature must be 86 base64url chars ending in [AQgw]'),
});

// 1. TASK_REQUEST Payload
export const TaskRequestPayloadSchema = z.object({
  task_id: z.string(),
  objective: z.string().min(1),
  requirements: z.array(z.string()),
  required_capabilities: z.array(z.string()),
  expected_output: z.string().optional(),
  deadline: z.string().datetime(),
  constraints: z.array(z.string()).optional(),
});

// 2. TASK_ACCEPT Payload
export const TaskAcceptPayloadSchema = z.object({
  task_id: z.string(),
  accepted_capabilities: z.array(z.string()),
  estimated_completion: z.string().datetime().optional(),
});

// 3. TASK_REJECT Payload
export const TaskRejectPayloadSchema = z.object({
  task_id: z.string(),
  reason: z.string().min(1),
  missing_capabilities: z.array(z.string()).optional(),
});

// 4. TASK_PROGRESS Payload
export const TaskProgressPayloadSchema = z.object({
  task_id: z.string(),
  stage: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string(),
});

// 5. TASK_RESULT Payload
export const EvidenceSchema = z.object({
  evidence_id: z.string().startsWith('ev_'),
  claim_id: z.string(),
  source: z.string(),
  locator: z.string(),
  extract: z.string(),
  collected_by: z.string(),
  collected_at: z.string().datetime(),
  untrusted: z.literal(true),
});

export const ClaimSchema = z.object({
  claim_id: z.string().startsWith('claim_'),
  statement: z.string().min(1),
  type: z.enum(['FACT', 'OBSERVATION', 'INTERPRETATION', 'INFERENCE', 'RECOMMENDATION']),
  origin_agent: z.string(),
  origin_task_id: z.string(),
  evidence_refs: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  verification_status: z.enum(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE']),
  verified_by: z.string().optional(),
  verification_reason: z.string().optional(),
  created_at: z.string().datetime(),
});

export const TaskResultPayloadSchema = z.object({
  result_id: z.string().startsWith('res_'),
  task_id: z.string(),
  summary: z.string(),
  claims: z.array(ClaimSchema),
  evidence: z.array(EvidenceSchema),
  limitations: z.array(z.string()),
});

// 6. EVIDENCE_REQUEST Payload
export const EvidenceRequestPayloadSchema = z.object({
  claim_id: z.string(),
  requested_by: z.string(),
  reason: z.string(),
  target_source: z.string().optional(),
});

// 7. EVIDENCE_RESPONSE Payload
export const EvidenceResponsePayloadSchema = z.object({
  claim_id: z.string(),
  evidence: z.array(EvidenceSchema),
  notes: z.string().optional(),
});

// 8. VERIFICATION Payload
export const VerificationPayloadSchema = z.object({
  claim_id: z.string(),
  status: z.enum(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE']),
  reason: z.string(),
  evidence_refs: z.array(z.string()),
  verifier: z.string(),
});

// 9. DISPUTE Payload
export const DisputePayloadSchema = z.object({
  dispute_id: z.string().startsWith('disp_'),
  claim_id: z.string(),
  challenger: z.string(),
  reason: z.string(),
  counter_evidence: z.array(EvidenceSchema),
});

// 10. REVISION_REQUEST Payload
export const RevisionRequestPayloadSchema = z.object({
  task_id: z.string(),
  reason: z.string(),
  required_adjustments: z.array(z.string()),
  requested_by: z.string(),
});

// 11. TASK_REASSIGN Payload
export const TaskReassignPayloadSchema = z.object({
  task_id: z.string(),
  previous_agent: z.string(),
  new_agent: z.string(),
  reason: z.string(),
  attempt: z.number().int().positive(),
});

// 12. FINAL_RESULT Payload
export const FinalResultPayloadSchema = z.object({
  mission_id: z.string(),
  objective: z.string(),
  executive_summary: z.string(),
  verified_claims: z.array(ClaimSchema),
  disputes_resolved: z.array(z.unknown()),
  protocol_risks: z.array(z.string()),
  recommendations: z.array(z.string()),
  unresolved_uncertainties: z.array(z.string()),
  synthesized_at: z.string().datetime(),
});
