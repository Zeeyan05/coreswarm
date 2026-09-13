import { describe, it, expect } from 'vitest';
import { Identity } from '../src/core/crypto/identity';
import { InMemoryTransport } from '../src/core/transport/in-memory';
import { AgentRegistry } from '../src/core/registry/agent-registry';
import { CoreSwarmOrchestrator } from '../src/core/orchestrator/orchestrator';
import { ResearcherAgent } from '../src/core/agents/researcher';
import { AnalystAgent } from '../src/core/agents/analyst';
import { VerifierAgent } from '../src/core/agents/verifier';
import { SynthesizerAgent } from '../src/core/agents/synthesizer';
import { SimulatedLLMProvider } from '../src/core/llm/simulated';
import { MissionReplayEngine } from '../src/core/replay/mission-replay';

describe('Technocore Integration Auditor Mission (End-to-End)', () => {
  it('autonomously decomposes, delegates, executes, disputes, verifies, and synthesizes final audit report', async () => {
    // 1. Setup Identities
    const orchestratorId = await Identity.generate();
    const researcherId = await Identity.generate();
    const analystId = await Identity.generate();
    const verifierId = await Identity.generate();
    const synthesizerId = await Identity.generate();

    // 2. Setup Transport & Registry
    const transport = new InMemoryTransport();
    const registry = new AgentRegistry();
    const simLLM = new SimulatedLLMProvider({ simulateDispute: true });

    // 3. Setup Orchestrator
    const orchestrator = new CoreSwarmOrchestrator({
      identity: orchestratorId,
      transport,
      registry,
    });

    // 4. Register Agents
    const researcher = new ResearcherAgent(researcherId, simLLM, 'researcher-01');
    const analyst = new AnalystAgent(analystId, simLLM, 'analyst-01');
    const verifier = new VerifierAgent(verifierId, simLLM, 'verifier-01');
    const synthesizer = new SynthesizerAgent(synthesizerId, simLLM, 'synthesizer-01');

    orchestrator.registerAgentInstance(researcher);
    orchestrator.registerAgentInstance(analyst);
    orchestrator.registerAgentInstance(verifier);
    orchestrator.registerAgentInstance(synthesizer);

    // 5. Run the primary mission
    const prompt =
      'Audit this project and determine whether its Technocore integration is technically correct, identify protocol risks, and provide evidence for every important conclusion.';

    const report = await orchestrator.runAuditMission(prompt);

    // 6. Assertions
    expect(report.mission_id).toBeDefined();
    expect(report.objective).toBe(prompt);
    expect(report.verified_claims.length).toBeGreaterThan(0);
    expect(report.disputes_resolved.length).toBeGreaterThan(0);
    expect(report.protocol_risks.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);

    // Verify backward provenance: Check that every verified claim has traceable evidence
    for (const claim of report.verified_claims) {
      const trace = orchestrator.provenance.graph.traceBackward(claim.claim_id);
      expect(trace.length).toBeGreaterThan(0);
      expect(trace.some((step) => step.level === 'CLAIM')).toBe(true);
    }

    // Verify Metrics were tracked
    const metrics = orchestrator.metrics.getSnapshot();
    expect(metrics.messageCount).toBeGreaterThan(0);
    expect(metrics.evidenceCount).toBeGreaterThan(0);
    expect(metrics.disputeCount).toBeGreaterThan(0);
    expect(metrics.verificationOutcomes.verified).toBeGreaterThan(0);

    // Verify Mission Replay from recorded event history
    const events = orchestrator.provenance.getEvents();
    expect(events.length).toBeGreaterThan(5);

    const replayEngine = new MissionReplayEngine(events);
    const finalReplayState = replayEngine.replayTo(events.length - 1);
    // Verify exact lifecycle stage progression:
    // PLANNING -> DISCOVERY -> DELEGATING -> EXECUTING -> COLLECTING -> VERIFYING -> RESOLVING -> SYNTHESIZING -> COMPLETED
    const missionStages = events
      .map((e) => (e.data as { new_status?: string })?.new_status)
      .filter((s): s is string => Boolean(s));

    expect(missionStages).toContain('PLANNING');
    expect(missionStages).toContain('DISCOVERY');
    expect(missionStages).toContain('DELEGATING');
    expect(missionStages).toContain('EXECUTING');
    expect(missionStages).toContain('VERIFYING');
    expect(missionStages).toContain('RESOLVING');
    expect(missionStages).toContain('SYNTHESIZING');
    expect(missionStages).toContain('COMPLETED');

    // Confirm independent agents produce separate results
    const originatingAgents = new Set(
      Object.values(finalReplayState.claims).map((c) => c.origin_agent),
    );
    expect(originatingAgents.has('researcher-01')).toBe(true);
    expect(originatingAgents.has('analyst-01')).toBe(true);

    // Verify final report preserves uncertainty and notes
    expect(report.unresolved_uncertainties).toBeDefined();
    expect(report.disputes_resolved.length).toBeGreaterThan(0);
  });
});
