/**
 * CoreSwarm Audit Mission Preset
 *
 * Builds the Technocore Integration Auditor task specs. This is ONE preset
 * for the generic runMission() engine — domain content lives here, not in
 * the orchestrator.
 */

import type { TaskSpec } from '../types/mission';

export const AUDIT_TASK_IDS = {
  crypto: 'task_audit_crypto',
  sweep: 'task_audit_sweep',
  security: 'task_audit_security',
  verification: 'task_independent_verification',
} as const;

export function buildAuditSpecs(): TaskSpec[] {
  return [
    {
      task_id: AUDIT_TASK_IDS.crypto,
      type: 'RESEARCH',
      title: 'Audit Cryptographic Primitives & DID Encoding',
      objective: 'Verify Ed25519 did:key:z6Mk... format, canonical UTF-8 payload format, and 86-char signature terminals.',
      requirements: ['inspect did.ts', 'inspect verify.ts', 'check terminal [AQgw] chars'],
      required_capabilities: ['protocol-research', 'code-audit'],
      dependencies: [],
    },
    {
      task_id: AUDIT_TASK_IDS.sweep,
      type: 'RESEARCH',
      title: 'Audit Single-Line Unicode Sweeping',
      objective: 'Verify that Unicode categories Cc, Cf, Cs, Co, Zl, Zp are swept to single spaces and trimmed.',
      requirements: ['inspect sweep.ts', 'verify regex pattern'],
      required_capabilities: ['source-analysis'],
      dependencies: [],
    },
    {
      task_id: AUDIT_TASK_IDS.security,
      type: 'SECURITY_AUDIT',
      title: 'Audit Replay Protection & Notes CAS Mechanics',
      objective: 'Inspect monotonic nonce behavior, 409 conflict handling, and concurrency limits.',
      requirements: ['inspect notes/index.ts', 'evaluate nonce collision risk'],
      required_capabilities: ['security-audit', 'consistency-check'],
      dependencies: [AUDIT_TASK_IDS.crypto],
    },
    {
      task_id: AUDIT_TASK_IDS.verification,
      type: 'VERIFICATION',
      title: 'Independent Claim & Evidence Verification',
      objective: 'Independently verify all extracted claims against code extracts, detect contradictions, and challenge invalid assertions.',
      requirements: ['cross-examine claims', 'verify citations'],
      required_capabilities: ['independent-verification', 'dispute-adjudication'],
      dependencies: [AUDIT_TASK_IDS.crypto, AUDIT_TASK_IDS.sweep, AUDIT_TASK_IDS.security],
    },
  ];
}

export const AUDIT_MISSION_META = {
  requirements: ['technocore-protocol-v0.11.1', 'traceable-evidence'],
  constraints: ['no-fabricated-scores', 'no-silently-dropped-disputes'],
  timeoutTaskId: AUDIT_TASK_IDS.security,
} as const;
