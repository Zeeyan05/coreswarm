import { describe, it, expect } from 'vitest';
import { DisputeEngine } from '../src/core/verification/dispute-engine';
import { VerifierEngine } from '../src/core/verification/verifier-engine';
import { ProvenanceGraph } from '../src/core/provenance/provenance-graph';
import type { Claim } from '../src/core/types/claims';
import type { Evidence } from '../src/core/types/evidence';

describe('Verification & Dispute Engine', () => {
  it('detects direct contradictions between claims and creates a formal dispute', () => {
    const disputeEngine = new DisputeEngine();

    const claimA: Claim = {
      claim_id: 'claim_crypto_1',
      statement: 'Base64url signatures strictly validate terminal characters [AQgw] to prevent malleability.',
      type: 'FACT',
      origin_agent: 'researcher-01',
      origin_task_id: 'task_audit_crypto',
      evidence_refs: ['ev_1'],
      confidence: 0.95,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    const claimB: Claim = {
      claim_id: 'claim_sec_1',
      statement: 'Signature verification in secondary paths allows arbitrary base64url padding without validating terminal characters [AQgw].',
      type: 'INFERENCE',
      origin_agent: 'analyst-01',
      origin_task_id: 'task_audit_security',
      evidence_refs: ['ev_2'],
      confidence: 0.75,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    const conflicts = disputeEngine.detectConflicts([claimA, claimB]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.reason).toMatch(/shared subject|ontradiction/);

    const dispute = disputeEngine.createDispute({
      mission_id: 'mission_01',
      claimA,
      claimB,
      reason: conflicts[0]!.reason,
      counter_evidence: [],
    });

    expect(dispute.status).toBe('OPEN');
    expect(dispute.claimant_agent).toBe('researcher-01');
    expect(dispute.challenger_agent).toBe('analyst-01');
  });

  it('independently verifies claims against evidence and maintains provenance graph', () => {
    const verifierEngine = new VerifierEngine();
    const provenance = new ProvenanceGraph();

    const ev1: Evidence = {
      evidence_id: 'ev_sweep_1',
      claim_id: 'claim_sweep_1',
      source: 'technocore-sdk/src/crypto/sweep.ts',
      locator: 'lines 28-41',
      extract: 'const SWEEP_PATTERN = /[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Co}\\p{Zl}\\p{Zp}]/gu; export function sweep(text: string): string { return text.replace(SWEEP_PATTERN, " ").trim(); }',
      collected_by: 'researcher-01',
      collected_at: new Date().toISOString(),
      untrusted: true,
    };

    const claim1: Claim = {
      claim_id: 'claim_sweep_1',
      statement: 'Single-line Unicode sweep cleans control characters Cc, Cf, Cs, Co, Zl, Zp.',
      type: 'FACT',
      origin_agent: 'researcher-01',
      origin_task_id: 'task_audit_sweep',
      evidence_refs: ['ev_sweep_1'],
      confidence: 0.99,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    provenance.recordEvidence(ev1);
    provenance.recordClaim(claim1);

    const { updatedClaims, decisions } = verifierEngine.verifyClaims(
      [claim1],
      { [ev1.evidence_id]: ev1 },
      'verifier-01',
    );

    expect(updatedClaims[0]!.verification_status).toBe('VERIFIED');
    expect(decisions.length).toBe(1);
    provenance.recordVerification(decisions[0]!);

    // Answer "Why does CoreSwarm believe this?"
    const trace = provenance.traceBackward('claim_sweep_1');
    expect(trace.some((t) => t.level === 'VERIFICATION')).toBe(true);
    expect(trace.some((t) => t.level === 'CLAIM')).toBe(true);
    expect(trace.some((t) => t.level === 'EVIDENCE')).toBe(true);
    expect(trace.some((t) => t.level === 'SOURCE')).toBe(true);
  });
});
