import { describe, it, expect } from 'vitest';
import { DisputeEngine } from '../src/core/verification/dispute-engine';
import { VerifierEngine } from '../src/core/verification/verifier-engine';
import { ProvenanceGraph } from '../src/core/provenance/provenance-graph';
import { ReplayGuard } from '../src/core/protocol/replay-guard';
import { CoreSwarmEnvelopeSchema } from '../src/core/protocol/validator';
import { Identity } from '../src/core/crypto/identity';
import type { Claim } from '../src/core/types/claims';
import type { Evidence } from '../src/core/types/evidence';

function makeClaim(overrides: Partial<Claim> & { claim_id: string }): Claim {
  return {
    statement: 'Test statement about protocol behavior.',
    type: 'FACT',
    origin_agent: 'researcher-01',
    origin_task_id: 'task_test',
    evidence_refs: [],
    confidence: 0.9,
    verification_status: 'UNVERIFIED',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> & { evidence_id: string; claim_id: string }): Evidence {
  return {
    source: 'src/example.ts',
    locator: 'lines 1-10',
    extract: 'This is a substantive code extract with more than forty characters of real content for testing.',
    collected_by: 'researcher-01',
    collected_at: new Date().toISOString(),
    untrusted: true,
    ...overrides,
  };
}

describe('Audit C regressions: verification attacks must fail', () => {
  it('garbage 16-char extract does NOT verify', () => {
    const engine = new VerifierEngine();
    const ev = makeEvidence({ evidence_id: 'ev_g', claim_id: 'c_g', extract: 'xxxxxxxxxxxxxxxx' });
    const claim = makeClaim({ claim_id: 'c_g', evidence_refs: ['ev_g'] });
    const { updatedClaims } = engine.verifyClaims([claim], { ev_g: ev }, 'verifier-01');
    expect(updatedClaims[0]!.verification_status).not.toBe('VERIFIED');
  });

  it('dangling evidence refs do NOT verify', () => {
    const engine = new VerifierEngine();
    const claim = makeClaim({ claim_id: 'c_d', evidence_refs: ['ev_ghost'] });
    const { updatedClaims } = engine.verifyClaims([claim], {}, 'verifier-01');
    expect(updatedClaims[0]!.verification_status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('evidence bound to another claim does NOT verify', () => {
    const engine = new VerifierEngine();
    const ev = makeEvidence({ evidence_id: 'ev_x', claim_id: 'c_other' });
    const claim = makeClaim({ claim_id: 'c_y', evidence_refs: ['ev_x'] });
    const { updatedClaims } = engine.verifyClaims([claim], { ev_x: ev }, 'verifier-01');
    expect(updatedClaims[0]!.verification_status).not.toBe('VERIFIED');
  });

  it('fabricated SIG_PATTERN substring does NOT force SUPPORTED_A', async () => {
    const engine = new DisputeEngine();
    const claimA = makeClaim({ claim_id: 'c_a', origin_agent: 'researcher-01', evidence_refs: [] });
    const claimB = makeClaim({ claim_id: 'c_b', origin_agent: 'analyst-01', evidence_refs: ['ev_fake'] });
    const fake = makeEvidence({
      evidence_id: 'ev_fake',
      claim_id: 'c_b',
      source: 'attacker',
      locator: 'x',
      extract: 'SIG_PATTERN [AQgw] trust me, this is definitely real evidence for sure yes',
    });
    const dispute = engine.createDispute({
      mission_id: 'm1',
      claimA,
      claimB,
      reason: 'test',
      counter_evidence: [fake],
    });
    const resolved = await engine.resolveDispute(dispute, claimA, claimB, {}, { ev_fake: fake });
    // Fake is bound to c_b with source+locator... it scores for B, not auto-A.
    expect(resolved.outcome).not.toBe('SUPPORTED_A');
  });

  it('challenger CAN win (SUPPORTED_B)', async () => {
    const engine = new DisputeEngine();
    const claimA = makeClaim({ claim_id: 'c_a2', origin_agent: 'researcher-01', evidence_refs: [] });
    const claimB = makeClaim({ claim_id: 'c_b2', origin_agent: 'analyst-01', evidence_refs: ['ev_real'] });
    const real = makeEvidence({ evidence_id: 'ev_real', claim_id: 'c_b2' });
    const dispute = engine.createDispute({
      mission_id: 'm1',
      claimA,
      claimB,
      reason: 'test',
      counter_evidence: [],
    });
    const resolved = await engine.resolveDispute(dispute, claimA, claimB, {}, { ev_real: real });
    expect(resolved.outcome).toBe('SUPPORTED_B');
  });

  it('generic numeric contradiction is detected', () => {
    const engine = new DisputeEngine();
    const a = makeClaim({
      claim_id: 'c_n1',
      statement: 'All signatures are 86 characters long.',
      origin_agent: 'researcher-01',
    });
    const b = makeClaim({
      claim_id: 'c_n2',
      statement: 'Signatures are 64 characters long.',
      origin_agent: 'analyst-01',
    });
    expect(engine.detectConflicts([a, b]).length).toBe(1);
  });

  it('provenance emits MISSING_EVIDENCE for dangling refs', () => {
    const g = new ProvenanceGraph();
    const claim = makeClaim({ claim_id: 'c_m', evidence_refs: ['ev_ghost'] });
    g.recordClaim(claim);
    const trace = g.traceBackward('c_m');
    expect(trace.some((t) => t.level === 'MISSING_EVIDENCE')).toBe(true);
  });
});

describe('Audit D regressions: failure/security wiring', () => {
  it('replay guard rejects duplicate envelopes end-to-end', async () => {
    const sender = await Identity.generate();
    const recipient = await Identity.generate();
    const envelope = await sender.signEnvelope({
      message_id: 'msg_dup_1',
      message_type: 'TASK_REQUEST',
      mission_id: 'mission_1',
      agent_id: 'agent-1',
      recipient: { agent_id: 'agent-2', did: recipient.did },
      payload: { hello: 'world' },
    });
    const parsed = CoreSwarmEnvelopeSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);

    const guard = new ReplayGuard();
    expect(guard.validateEnvelope(envelope).ok).toBe(true);
    const second = guard.validateEnvelope(envelope);
    expect(second.ok).toBe(false);
    expect(second.reason).toContain('Duplicate message_id');
  });

  it('idempotency guard rejects duplicate result submissions', () => {
    const guard = new ReplayGuard();
    expect(guard.recordResultSubmission('res_1')).toBe(true);
    expect(guard.recordResultSubmission('res_1')).toBe(false);
  });
});

describe('Persistence: export/import round-trip with cross-check', () => {
  it('exports a mission and re-imports it verified', async () => {
    const { CoreSwarmOrchestrator } = await import('../src/core/orchestrator/orchestrator');
    const { InMemoryTransport } = await import('../src/core/transport/in-memory');
    const { AgentRegistry } = await import('../src/core/registry/agent-registry');
    const { ResearcherAgent } = await import('../src/core/agents/researcher');
    const { SimulatedLLMProvider } = await import('../src/core/llm/simulated');
    const { exportMission, importMission } = await import('../src/core/persistence/index');

    const orchId = await Identity.generate();
    const resId = await Identity.generate();
    const orch = new CoreSwarmOrchestrator({
      identity: orchId,
      transport: new InMemoryTransport(),
      registry: new AgentRegistry(),
    });
    orch.registerAgentInstance(new ResearcherAgent(resId, new SimulatedLLMProvider(), 'researcher-01'));
    await orch.runMission('Persist me', [
      {
        task_id: 'task_p1',
        type: 'RESEARCH',
        title: 'Persist task',
        objective: 'Do work',
        requirements: [],
        required_capabilities: ['source-analysis'],
        dependencies: [],
      },
    ]);

    const mission = orch.getCurrentMission()!;
    const events = orch.provenance.getEvents();
    const exported = exportMission(mission, events, '12345');
    const { verified, mismatches } = importMission(exported);
    expect(verified).toBe(true);
    expect(mismatches).toEqual([]);

    // Tampered snapshot fails the cross-check
    const tampered = { ...exported, mission: { ...mission, status: 'FAILED' as const } };
    const bad = importMission(tampered);
    expect(bad.verified).toBe(false);
    expect(bad.mismatches.length).toBeGreaterThan(0);
  });

  it('loadMission restores live orchestrator state', async () => {
    const { CoreSwarmOrchestrator } = await import('../src/core/orchestrator/orchestrator');
    const { InMemoryTransport } = await import('../src/core/transport/in-memory');
    const { AgentRegistry } = await import('../src/core/registry/agent-registry');
    const { ResearcherAgent } = await import('../src/core/agents/researcher');
    const { SimulatedLLMProvider } = await import('../src/core/llm/simulated');
    const { exportMission } = await import('../src/core/persistence/index');

    const orchA = new CoreSwarmOrchestrator({
      identity: await Identity.generate(),
      transport: new InMemoryTransport(),
      registry: new AgentRegistry(),
    });
    orchA.registerAgentInstance(new ResearcherAgent(await Identity.generate(), new SimulatedLLMProvider(), 'researcher-01'));
    await orchA.runMission('Load me', [
      {
        task_id: 'task_l1',
        type: 'RESEARCH',
        title: 'Load task',
        objective: 'Do work',
        requirements: [],
        required_capabilities: ['source-analysis'],
        dependencies: [],
      },
    ]);
    const exported = exportMission(orchA.getCurrentMission()!, orchA.provenance.getEvents());

    const orchB = new CoreSwarmOrchestrator({
      identity: await Identity.generate(),
      transport: new InMemoryTransport(),
      registry: new AgentRegistry(),
    });
    const loaded = orchB.loadMission(exported);
    expect(loaded.mission_id).toBe(orchA.getCurrentMission()!.mission_id);
    expect(loaded.status).toBe('COMPLETED');
    expect(orchB.getDAG()?.getAllTasks().length).toBe(1);
    expect(orchB.provenance.getEventCount()).toBe(orchA.provenance.getEventCount());
  });

  it('nonce restore prevents regression after restart', async () => {
    const { NonceManager } = await import('../src/core/crypto/nonce');
    const a = new NonceManager();
    const n1 = a.next();
    const n2 = a.next();
    expect(BigInt(n2) > BigInt(n1)).toBe(true);

    // Simulate restart: fresh manager restores the watermark
    const b = new NonceManager();
    b.restore(n2);
    const n3 = b.next();
    expect(BigInt(n3) > BigInt(n2)).toBe(true);

    // Malformed watermark rejected
    expect(() => b.restore('not-a-number')).toThrow();
  });
});

describe('Entailment: extracts must support their claims', () => {
  it('unrelated long extract does NOT verify', async () => {
    const { VerifierEngine } = await import('../src/core/verification/verifier-engine');
    const engine = new VerifierEngine();
    const ev = {
      evidence_id: 'ev_unrelated',
      claim_id: 'c_u',
      source: 'src/other.ts',
      locator: 'lines 1-30',
      extract: 'This lengthy extract discusses database connection pooling configuration and retry backoff strategies at great length indeed.',
      collected_by: 'researcher-01',
      collected_at: new Date().toISOString(),
      untrusted: true as const,
    };
    const claim = {
      claim_id: 'c_u',
      statement: 'Ed25519 signatures strictly validate terminal characters for protocol compliance.',
      type: 'FACT' as const,
      origin_agent: 'researcher-01',
      origin_task_id: 'task_test',
      evidence_refs: ['ev_unrelated'],
      confidence: 0.9,
      verification_status: 'UNVERIFIED' as const,
      created_at: new Date().toISOString(),
    };
    const { updatedClaims } = engine.verifyClaims([claim], { ev_unrelated: ev }, 'verifier-01');
    expect(updatedClaims[0]!.verification_status).not.toBe('VERIFIED');
  });

  it('contradicting extract does NOT verify', async () => {
    const { VerifierEngine } = await import('../src/core/verification/verifier-engine');
    const engine = new VerifierEngine();
    const ev = {
      evidence_id: 'ev_contra',
      claim_id: 'c_c',
      source: 'src/verify.ts',
      locator: 'lines 30-45',
      extract: 'Signature verification strictly validates terminal characters and always enforces canonical padding requirements.',
      collected_by: 'researcher-01',
      collected_at: new Date().toISOString(),
      untrusted: true as const,
    };
    const claim = {
      claim_id: 'c_c',
      statement: 'Signature verification allows arbitrary padding without validating terminal characters.',
      type: 'INFERENCE' as const,
      origin_agent: 'analyst-01',
      origin_task_id: 'task_test',
      evidence_refs: ['ev_contra'],
      confidence: 0.7,
      verification_status: 'UNVERIFIED' as const,
      created_at: new Date().toISOString(),
    };
    const { updatedClaims } = engine.verifyClaims([claim], { ev_contra: ev }, 'verifier-01');
    expect(updatedClaims[0]!.verification_status).not.toBe('VERIFIED');
  });
});

describe('Decomposer: objective → validated TaskSpecs', () => {
  it('rejects unknown capabilities and bad dependencies', async () => {
    const { validateSpecs } = await import('../src/core/llm/decomposer');
    expect(() =>
      validateSpecs({ tasks: [{ task_id: 't1', type: 'RESEARCH', title: 'T', objective: 'O', required_capabilities: ['nope'], dependencies: [] }] }, ['source-analysis']),
    ).toThrow(/Unknown capabilities/);
    expect(() =>
      validateSpecs({ tasks: [{ task_id: 't1', type: 'RESEARCH', title: 'T', objective: 'O', dependencies: ['ghost'] }] }, []),
    ).toThrow(/unknown/);
    expect(() =>
      validateSpecs({ tasks: [] }, []),
    ).toThrow(/1\.\.12/);
  });

  it('accepts a valid generic plan', async () => {
    const { validateSpecs } = await import('../src/core/llm/decomposer');
    const specs = validateSpecs(
      { tasks: [{ task_id: 'task_sum', type: 'RESEARCH', title: 'Summarize', objective: 'Summarize docs', required_capabilities: ['source-analysis'], dependencies: [] }] },
      ['source-analysis'],
    );
    expect(specs.length).toBe(1);
    expect(specs[0]!.task_id).toBe('task_sum');
  });
});

describe('Nonce coordinator: CAS reservation', () => {
  it('two instances sharing a DID never collide', async () => {
    const { NonceCoordinator, MemoryKvBackend } = await import('../src/core/transport/nonce-coordinator');
    const backend = new MemoryKvBackend();
    const a = new NonceCoordinator(backend);
    const b = new NonceCoordinator(backend);
    let la = 100n;
    let lb = 100n;
    const n1 = await a.reserve('room1', 'did:test', () => (++la).toString());
    const n2 = await b.reserve('room1', 'did:test', () => (++lb).toString());
    expect(n1).not.toBe(n2);
    expect(BigInt(n2) > BigInt(n1)).toBe(true);
  });
});

describe('Audit E regressions: generic runMission', () => {
  it('runMission accepts custom task specs (non-audit mission)', async () => {
    const { CoreSwarmOrchestrator } = await import('../src/core/orchestrator/orchestrator');
    const { InMemoryTransport } = await import('../src/core/transport/in-memory');
    const { AgentRegistry } = await import('../src/core/registry/agent-registry');
    const { ResearcherAgent } = await import('../src/core/agents/researcher');
    const { SimulatedLLMProvider } = await import('../src/core/llm/simulated');

    const orchId = await Identity.generate();
    const resId = await Identity.generate();
    const transport = new InMemoryTransport();
    const registry = new AgentRegistry();
    const simLLM = new SimulatedLLMProvider();
    const orch = new CoreSwarmOrchestrator({ identity: orchId, transport, registry });
    orch.registerAgentInstance(new ResearcherAgent(resId, simLLM, 'researcher-01'));

    const report = await orch.runMission('Summarize these documents', [
      {
        task_id: 'task_summarize',
        type: 'RESEARCH',
        title: 'Summarize documents',
        objective: 'Produce summaries',
        requirements: [],
        required_capabilities: ['source-analysis'],
        dependencies: [],
      },
    ]);

    expect(report.mission_id).toBeDefined();
    expect(report.objective).toBe('Summarize these documents');
    // Generic mission completes without audit-specific disputes
    expect(orch.getCurrentMission()?.status).toBe('COMPLETED');
  });
});
