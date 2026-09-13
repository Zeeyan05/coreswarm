import { describe, it, expect } from 'vitest';
import { Identity } from '../src/core/crypto/identity';
import { verifyEnvelopeSignature } from '../src/core/crypto/verify';
import { DisputeEngine } from '../src/core/verification/dispute-engine';
import { VerifierEngine } from '../src/core/verification/verifier-engine';
import { TaskStateMachine } from '../src/core/state/task-state';
import { ReplayGuard } from '../src/core/protocol/replay-guard';
import { CoreSwarmEnvelopeSchema } from '../src/core/protocol/validator';
import { ResearcherAgent } from '../src/core/agents/researcher';
import { AnalystAgent } from '../src/core/agents/analyst';
import { SimulatedLLMProvider } from '../src/core/llm/simulated';
import type { Task } from '../src/core/types/task';
import type { Claim } from '../src/core/types/claims';
import type { Evidence } from '../src/core/types/evidence';
import type { CoreSwarmEnvelope } from '../src/core/types/protocol';

describe('Layer 4 Proof Scenarios: CoreSwarm Seven Crucial Verifications', () => {
  // Scenario 1: Conflicting Agent Findings -> DISPUTE
  it('Scenario 1: Conflicting agent findings trigger a formal DISPUTE with original claims preserved', async () => {
    const disputeEngine = new DisputeEngine();

    const claimA: Claim = {
      claim_id: 'claim_task_audit_crypto_1',
      statement: 'Ed25519 86-char base64url signatures strictly validate terminal characters [AQgw] to prevent non-canonical encoding malleability.',
      type: 'FACT',
      origin_agent: 'researcher-01',
      origin_task_id: 'task_audit_crypto',
      evidence_refs: ['ev_crypto_1'],
      confidence: 0.98,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    const claimB: Claim = {
      claim_id: 'claim_task_audit_security_1',
      statement: 'Signature verification in secondary paths allows arbitrary base64url padding without validating terminal characters [AQgw].',
      type: 'INFERENCE',
      origin_agent: 'analyst-01',
      origin_task_id: 'task_audit_security',
      evidence_refs: ['ev_security_1'],
      confidence: 0.74,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    const conflicts = disputeEngine.detectConflicts([claimA, claimB]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.reason).toMatch(/shared subject|ontradiction/);

    const dispute = disputeEngine.createDispute({
      mission_id: 'mission_test_dispute_1',
      claimA: conflicts[0]!.claimA,
      claimB: conflicts[0]!.claimB,
      reason: conflicts[0]!.reason,
      counter_evidence: [],
    });

    expect(dispute.dispute_id).toMatch(/^disp_/);
    expect(dispute.claim_id).toBe(claimA.claim_id);
    expect(dispute.claimant_agent).toBe(claimA.origin_agent);
    expect(dispute.challenger_agent).toBe(claimB.origin_agent);
    expect(dispute.status).toBe('OPEN');
    expect(dispute.created_at).toBeDefined();
    expect(dispute.reason).toMatch(/shared subject|ontradiction/);
  });

  // Scenario 2: Evidence Request -> Evidence Response
  it('Scenario 2: Supplemental evidence request triggers agent response with verifiable citations', async () => {
    const researcherId = await Identity.generate();
    const simLLM = new SimulatedLLMProvider();
    const researcher = new ResearcherAgent(researcherId, simLLM, 'researcher-01');

    // Agent executes task and stores evidence cache
    const task: Task = {
      task_id: 'task_audit_crypto',
      mission_id: 'mission_ev_req_1',
      type: 'RESEARCH',
      title: 'Audit Cryptographic Primitives',
      objective: 'Verify Ed25519 did:key:z6Mk... format and 86-char signature terminals.',
      requirements: ['inspect did.ts', 'check terminal [AQgw] chars'],
      required_capabilities: ['protocol-research'],
      dependencies: [],
      status: 'EXECUTING',
      attempt: 1,
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
    };

    const result = await researcher.executeTask(task, { mission_id: 'mission_ev_req_1' });
    expect(result.claims.length).toBeGreaterThan(0);
    const targetClaim = result.claims[0]!;

    // Trigger explicit evidence request
    const supplementalEvidence = await researcher.handleEvidenceRequest(
      targetClaim.claim_id,
      'Dispute resolution requires exact code extract showing regex validation',
    );

    expect(supplementalEvidence.length).toBeGreaterThan(0);
    expect(supplementalEvidence[0]!.claim_id).toBe(targetClaim.claim_id);
    expect(supplementalEvidence[0]!.source).toBeDefined();
    expect(supplementalEvidence[0]!.locator).toBeDefined();
    expect(supplementalEvidence[0]!.extract.length).toBeGreaterThan(10);
    expect(supplementalEvidence[0]!.untrusted).toBe(true);
  });

  // Scenario 3: Verifier Adjudication
  it('Scenario 3: Verifier adjudicates dispute based on code extracts and issues authoritative decision', async () => {
    const disputeEngine = new DisputeEngine();
    const verifierEngine = new VerifierEngine();

    const claimA: Claim = {
      claim_id: 'claim_crypto_adjudicate',
      statement: 'Ed25519 86-char base64url signatures strictly validate terminal characters [AQgw] to prevent non-canonical encoding malleability.',
      type: 'FACT',
      origin_agent: 'researcher-01',
      origin_task_id: 'task_audit_crypto',
      evidence_refs: ['ev_spec_1'],
      confidence: 0.98,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    const claimB: Claim = {
      claim_id: 'claim_sec_adjudicate',
      statement: 'Signature verification in secondary paths allows arbitrary base64url padding without validating terminal characters [AQgw].',
      type: 'INFERENCE',
      origin_agent: 'analyst-01',
      origin_task_id: 'task_audit_security',
      evidence_refs: ['ev_sec_1'],
      confidence: 0.74,
      verification_status: 'UNVERIFIED',
      created_at: new Date().toISOString(),
    };

    const evidenceMap: Record<string, Evidence> = {
      ev_spec_1: {
        evidence_id: 'ev_spec_1',
        claim_id: claimA.claim_id,
        source: 'technocore-sdk/src/types/index.ts',
        locator: 'lines 37-43',
        extract: 'export const SIG_PATTERN = /^[A-Za-z0-9_-]{85}[AQgw]$/;\nexport const SIG_TERMINAL_CHARS = new Set(["A", "Q", "g", "w"]);',
        collected_by: 'researcher-01',
        collected_at: new Date().toISOString(),
        untrusted: true,
      },
    };

    const dispute = disputeEngine.createDispute({
      mission_id: 'mission_adjudicate_1',
      claimA,
      claimB,
      reason: 'Contradiction regarding terminal validation',
      counter_evidence: [evidenceMap.ev_spec_1!],
    });

    const resolved = await disputeEngine.resolveDispute(dispute, claimA, claimB, {}, evidenceMap);
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.outcome).toBe('SUPPORTED_A');
    expect(resolved.adjudication).toContain('researcher-01');

    // Verifier engine applies decision
    const { updatedClaims, decisions } = verifierEngine.verifyClaims([claimA], evidenceMap, 'verifier-01');
    expect(updatedClaims[0]!.verification_status).toBe('VERIFIED');
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.status).toBe('VERIFIED');
  });

  // Scenario 4: Revision Request
  it('Scenario 4: Revision request triggers re-execution and successfully updates contradicted finding', async () => {
    const analystId = await Identity.generate();
    const simLLM = new SimulatedLLMProvider();
    const analyst = new AnalystAgent(analystId, simLLM, 'analyst-01');
    const sm = new TaskStateMachine();

    let task: Task = {
      task_id: 'task_audit_security',
      mission_id: 'mission_rev_1',
      type: 'SECURITY_AUDIT',
      title: 'Audit Replay Protection & Notes CAS Mechanics',
      objective: 'Inspect monotonic nonces and terminal validation.',
      requirements: ['inspect verify.ts'],
      required_capabilities: ['security-audit'],
      dependencies: [],
      status: 'DISPUTED',
      attempt: 1,
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
    };

    // Transition: DISPUTED -> REVISION_REQUESTED
    task = sm.transition(task, 'REVISION_REQUESTED', {
      actor_id: 'verifier-01',
      reason: 'Claim contradicted by code extract. Adjust finding to reflect SIG_PATTERN terminal validation.',
    });
    expect(task.status).toBe('REVISION_REQUESTED');

    // Transition: REVISION_REQUESTED -> EXECUTING
    task = sm.transition(task, 'EXECUTING', {
      actor_id: analyst.agent_id,
      reason: 'Executing revision adjustment',
    });
    expect(task.status).toBe('EXECUTING');

    const revisedResult = await analyst.handleRevisionRequest(
      task,
      {
        task_id: task.task_id,
        reason: 'Adjust finding to reflect SIG_PATTERN terminal validation.',
        required_adjustments: ['Update finding to acknowledge SIG_PATTERN regex terminal validation'],
        requested_by: 'verifier-01',
        created_at: new Date().toISOString(),
      },
      { mission_id: 'mission_rev_1' },
    );

    expect(revisedResult.claims.some((c) => c.statement.includes('Verified: SIG_PATTERN regex'))).toBe(true);

    // Transition: EXECUTING -> RESULT_SUBMITTED -> VERIFYING -> VERIFIED -> COMPLETED
    task = sm.transition(task, 'RESULT_SUBMITTED', { actor_id: analyst.agent_id });
    task = sm.transition(task, 'VERIFYING', { actor_id: 'verifier-01' });
    task = sm.transition(task, 'VERIFIED', { actor_id: 'verifier-01', reason: 'Revision verified' });
    task = sm.transition(task, 'COMPLETED', { actor_id: 'orchestrator' });
    expect(task.status).toBe('COMPLETED');
  });

  // Scenario 5: Agent Timeout -> Reassignment
  it('Scenario 5: Agent timeout transitions through TIMEOUT -> REASSIGNED (attempt 2) -> EXECUTING', async () => {
    const sm = new TaskStateMachine();

    let task: Task = {
      task_id: 'task_audit_security',
      mission_id: 'mission_timeout_1',
      type: 'SECURITY_AUDIT',
      title: 'Audit Replay Protection',
      objective: 'Inspect nonces.',
      requirements: [],
      required_capabilities: ['security-audit'],
      dependencies: [],
      status: 'EXECUTING',
      attempt: 1,
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 60_000).toISOString(),
    };

    // 1. Trigger timeout: EXECUTING -> TIMEOUT
    task = sm.transition(task, 'TIMEOUT', {
      actor_id: 'orchestrator',
      reason: 'Agent execution deadline expired',
    });
    expect(task.status).toBe('TIMEOUT');
    expect(task.attempt).toBe(1);

    // 2. TIMEOUT -> REASSIGNED (attempt increments to 2)
    task = sm.transition(task, 'REASSIGNED', {
      actor_id: 'orchestrator',
      reason: 'Reassigning task after timeout',
      assigned_agent: 'analyst-02',
    });
    expect(task.status).toBe('REASSIGNED');
    expect(task.attempt).toBe(2);
    expect(task.assigned_agent).toBe('analyst-02');

    // 3. REASSIGNED -> EXECUTING
    task = sm.transition(task, 'EXECUTING', {
      actor_id: 'analyst-02',
      reason: 'Resuming execution on second attempt',
    });
    expect(task.status).toBe('EXECUTING');
  });

  // Scenario 6: Malformed / Invalid Response Rejection
  it('Scenario 6: Malformed envelopes and tampered signatures are rejected by validation layer', async () => {
    const sender = await Identity.generate();
    const recipient = await Identity.generate();

    // 1. Envelope with corrupted protocol version
    const invalidVersion = {
      protocol: 'coreswarm/999', // invalid
      message_id: 'msg_test_1',
      message_type: 'TASK_REQUEST',
      mission_id: 'mission_1',
      sender: { agent_id: 'agent-1', did: sender.did },
      recipient: { agent_id: 'agent-2', did: recipient.did },
      created_at: new Date().toISOString(),
      nonce: '100',
      payload: {},
      references: [],
      signature: 'A'.repeat(85) + 'A',
    };
    const parseResult = CoreSwarmEnvelopeSchema.safeParse(invalidVersion);
    expect(parseResult.success).toBe(false);

    // 2. Envelope with forged/tampered signature
    const validEnvelope = await sender.signEnvelope({
      message_id: 'msg_tamper_test',
      message_type: 'TASK_REQUEST',
      mission_id: 'mission_tamper_1',
      task_id: 'task_1',
      agent_id: 'orchestrator',
      recipient: { agent_id: 'agent-2', did: recipient.did },
      payload: { test: 'original' },
    });

    // Tamper with payload after signing
    const tamperedEnvelope: CoreSwarmEnvelope = {
      ...validEnvelope,
      payload: { test: 'tampered_malicious_content' },
    };

    const verifyCheck = await verifyEnvelopeSignature(tamperedEnvelope);
    expect(verifyCheck.valid).toBe(false);
    expect(verifyCheck.error).toContain('Ed25519 signature mismatch');
  });

  // Scenario 7: Replay / Duplicate-Message Rejection
  it('Scenario 7: ReplayGuard rejects duplicate message IDs and regressed nonces', async () => {
    const guard = new ReplayGuard(300_000);
    const sender = await Identity.generate();
    const recipient = await Identity.generate();

    const envelope1 = await sender.signEnvelope({
      message_id: 'msg_replay_check_1',
      message_type: 'TASK_REQUEST',
      mission_id: 'mission_replay_1',
      task_id: 'task_1',
      agent_id: 'orchestrator',
      recipient: { agent_id: 'agent-2', did: recipient.did },
      payload: { step: 1 },
    });

    // First arrival should be accepted
    const check1 = guard.validateEnvelope(envelope1);
    expect(check1.ok).toBe(true);

    // Duplicate message_id replay should be rejected
    const checkDuplicateId = guard.validateEnvelope(envelope1);
    expect(checkDuplicateId.ok).toBe(false);
    expect(checkDuplicateId.reason).toContain('Duplicate message_id');

    // Nonce regression check: create envelope with smaller nonce
    const regressedEnvelope: CoreSwarmEnvelope = {
      ...envelope1,
      message_id: 'msg_replay_check_2',
      nonce: '1', // regressed nonce
    };

    const checkNonceRegression = guard.validateEnvelope(regressedEnvelope);
    expect(checkNonceRegression.ok).toBe(false);
    expect(checkNonceRegression.reason).toContain('Nonce regression');
  });
});
