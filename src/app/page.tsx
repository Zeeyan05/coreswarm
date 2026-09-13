'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MissionShell, ViewKey } from '@/components/MissionShell';
import { GuidedTour } from '@/components/GuidedTour';
import { CommandDeck } from '@/components/CommandDeck';
import { EvidenceTrace } from '@/components/EvidenceTrace';
import { DisputeArena } from '@/components/DisputeArena';
import { VerifyLedger } from '@/components/VerifyLedger';
import { ReplayTheater } from '@/components/ReplayTheater';
import { ProtocolDebugger } from '@/components/ProtocolDebugger';
import { AgentConstellation } from '@/components/AgentConstellation';
import { Telemetry } from '@/components/Telemetry';

import { Identity } from '@/core/crypto/identity';
import { InMemoryTransport } from '@/core/transport/in-memory';
import { AgentRegistry } from '@/core/registry/agent-registry';
import { CoreSwarmOrchestrator } from '@/core/orchestrator/orchestrator';
import { ResearcherAgent } from '@/core/agents/researcher';
import { AnalystAgent } from '@/core/agents/analyst';
import { VerifierAgent } from '@/core/agents/verifier';
import { SynthesizerAgent } from '@/core/agents/synthesizer';
import { SimulatedLLMProvider } from '@/core/llm/simulated';
import type { Mission, FinalReport } from '@/core/types/mission';
import type { Task } from '@/core/types/task';
import type { Claim } from '@/core/types/claims';
import type { Evidence } from '@/core/types/evidence';
import type { Dispute } from '@/core/types/verification';
import type { CoreSwarmEnvelope } from '@/core/types/protocol';
import type { CoreSwarmEvent } from '@/core/types/events';
import type { AgentMetadata } from '@/core/types/agent';
import type { SystemMetrics } from '@/core/orchestrator/metrics';

const EMPTY_METRICS: SystemMetrics = {
  missionDurationMs: 0,
  taskDurations: {},
  agentLatencies: {},
  taskFailures: 0,
  timeouts: 0,
  retries: 0,
  verificationOutcomes: { verified: 0, partiallyVerified: 0, contradicted: 0, insufficientEvidence: 0 },
  disputeCount: 0,
  evidenceCount: 0,
  messageCount: 0,
};

const VIEW_HASHES: readonly ViewKey[] = ['command', 'evidence', 'disputes', 'verify', 'replay', 'protocol', 'agents'];

function viewFromHash(): ViewKey {
  if (typeof window === 'undefined') return 'command';
  const h = window.location.hash.replace(/^#\/?/, '') as ViewKey;
  return (VIEW_HASHES as readonly string[]).includes(h) ? h : 'command';
}

export default function CoreSwarmPage() {
  const [view, setViewState] = useState<ViewKey>('command');

  // Deep-linkable views (#9): #/evidence, #/replay, ... shareable + back-button safe.
  useEffect(() => {
    setViewState(viewFromHash());
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setView = (v: ViewKey) => {
    setViewState(v);
    if (typeof window !== 'undefined' && viewFromHash() !== v) {
      window.location.hash = `/${v}`;
    }
  };
  const [isRunning, setIsRunning] = useState(false);
  const [simulateDispute, setSimulateDispute] = useState(true);
  const [simulateTimeout, setSimulateTimeout] = useState(false);

  const [mission, setMission] = useState<Mission | null>(null);
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [evidenceGraph, setEvidenceGraph] = useState<Record<string, Evidence>>({});
  const [disputes, setDisputes] = useState<Record<string, Dispute>>({});
  const [envelopes, setEnvelopes] = useState<CoreSwarmEnvelope[]>([]);
  const [events, setEvents] = useState<CoreSwarmEvent[]>([]);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [registeredAgents, setRegisteredAgents] = useState<AgentMetadata[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY_METRICS);
  const [elapsedMs, setElapsedMs] = useState(0);

  const orchestratorRef = useRef<CoreSwarmOrchestrator | null>(null);
  const simLLMRef = useRef<SimulatedLLMProvider | null>(null);
  const runStartRef = useRef(0);

  // Mission history (#10): last 10 runs in localStorage with export links.
  // Initialized empty for SSR; hydrated client-side to avoid mismatch.
  const [history, setHistory] = useState<Array<{ mission_id: string; objective: string; status: string; at: string }>>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('coreswarm-history');
      if (raw) {
        setHistory(JSON.parse(raw) as Array<{ mission_id: string; objective: string; status: string; at: string }>);
      }
    } catch {
      // corrupted storage — start fresh
    }
  }, []);

  const recordHistory = (m: Mission) => {
    setHistory((prev) => {
      const next = [{ mission_id: m.mission_id, objective: m.objective, status: m.status, at: new Date().toISOString() },
        ...prev.filter((h) => h.mission_id !== m.mission_id)].slice(0, 10);
      try {
        localStorage.setItem('coreswarm-history', JSON.stringify(next));
      } catch {
        // storage full/blocked — history is best-effort
      }
      return next;
    });
  };

  useEffect(() => {
    let unmounted = false;

    async function initNetwork() {
      const orchestratorId = await Identity.generate();
      const researcherId = await Identity.generate();
      const analystId = await Identity.generate();
      const verifierId = await Identity.generate();
      const synthesizerId = await Identity.generate();

      const transport = new InMemoryTransport();
      const registry = new AgentRegistry();
      const simLLM = new SimulatedLLMProvider({ simulateDispute });
      simLLMRef.current = simLLM;

      const orch = new CoreSwarmOrchestrator({ identity: orchestratorId, transport, registry });
      orch.registerAgentInstance(new ResearcherAgent(researcherId, simLLM, 'researcher-01'));
      orch.registerAgentInstance(new AnalystAgent(analystId, simLLM, 'analyst-01'));
      orch.registerAgentInstance(new VerifierAgent(verifierId, simLLM, 'verifier-01'));
      orch.registerAgentInstance(new SynthesizerAgent(synthesizerId, simLLM, 'synthesizer-01'));

      orch.onEvent((event) => {
        if (unmounted) return;
        setEvents((prev) => [...prev, event]);
        const currentM = orch.getCurrentMission();
        if (currentM) {
          setMission({ ...currentM });
          setTasks({ ...currentM.tasks });
          setClaims({ ...currentM.claims });
          setEvidenceGraph({ ...currentM.evidence_graph });
          setDisputes({ ...currentM.disputes });
          if (currentM.final_result) setFinalReport(currentM.final_result);
        }
        setMetrics(orch.metrics.getSnapshot());
      });

      for (const id of ['researcher-01', 'analyst-01', 'verifier-01', 'synthesizer-01']) {
        transport.subscribe(`mb-coreswarm-${id}`, (envelope) => {
          if (unmounted) return;
          setEnvelopes((prev) => [...prev.slice(-199), envelope]);
        });
      }

      orchestratorRef.current = orch;
      setRegisteredAgents(registry.listAll());
    }

    initNetwork();
    return () => { unmounted = true; };
  }, []);

  // Elapsed clock while running
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setElapsedMs(Date.now() - runStartRef.current), 500);
    return () => clearInterval(t);
  }, [isRunning]);

  const handleRunMission = async (options: { simulateDispute: boolean; simulateTimeout: boolean }) => {
    if (!orchestratorRef.current || isRunning) return;
    setIsRunning(true);
    setFinalReport(null);
    setElapsedMs(0);
    runStartRef.current = Date.now();
    try {
      simLLMRef.current?.setScenarioConfig({ simulateDispute: options.simulateDispute });
      const report = await orchestratorRef.current.runAuditMission(
        'Audit this project and determine whether its Technocore integration is technically correct, identify protocol risks, and provide evidence for every important conclusion.',
        options,
      );
      setFinalReport(report);
      const done = orchestratorRef.current.getCurrentMission();
      setMission(done);
      if (done) recordHistory(done);
    } catch (err) {
      console.error('Error executing mission:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    if (isRunning) return;
    setMission(null);
    setTasks({});
    setClaims({});
    setEvidenceGraph({});
    setDisputes({});
    setEnvelopes([]);
    setEvents([]);
    setFinalReport(null);
    setElapsedMs(0);
    if (orchestratorRef.current) setMetrics(orchestratorRef.current.metrics.getSnapshot());
  };

  /** Load a persisted mission export. Returns an error string, or null on success. */
  const handleImport = (data: unknown): string | null => {
    if (!orchestratorRef.current || isRunning) return 'Busy — wait for the mission to finish.';
    try {
      const loaded = orchestratorRef.current.loadMission(data);
      setMission({ ...loaded });
      setTasks({ ...loaded.tasks });
      setClaims({ ...loaded.claims });
      setEvidenceGraph({ ...loaded.evidence_graph });
      setDisputes({ ...loaded.disputes });
      if (loaded.final_result) setFinalReport(loaded.final_result);
      const evts = orchestratorRef.current.provenance.getEvents();
      setEvents([...evts]);
      setMetrics(orchestratorRef.current.metrics.getSnapshot());
      return null;
    } catch (err) {
      return `Import rejected: ${(err as Error)?.message ?? String(err)}`;
    }
  };

  const go = (v: 'evidence' | 'disputes' | 'replay') =>
    setView(v === 'evidence' ? 'evidence' : v === 'disputes' ? 'disputes' : 'replay');

  return (
    <MissionShell
      view={view}
      onView={setView}
      missionId={mission?.mission_id}
      missionStatus={mission?.status}
      isRunning={isRunning}
      elapsedMs={isRunning ? elapsedMs : (metrics.missionDurationMs || elapsedMs)}
      disputeCount={metrics.disputeCount}
      tourButton={
        <GuidedTour
          ctx={{
            view,
            missionExists: mission !== null,
            missionCompleted: mission?.status === 'COMPLETED',
            isRunning,
            disputeCount: metrics.disputeCount,
            claimCount: Object.keys(claims).length,
            eventCount: events.length,
          }}
          onNavigate={setView}
          onLaunch={() => void handleRunMission({ simulateDispute, simulateTimeout })}
          onReset={handleReset}
        />
      }
    >
      {view === 'command' && (
        <CommandDeck
          mission={mission} report={finalReport} metrics={metrics}
          tasks={tasks} claims={claims} evidenceGraph={evidenceGraph}
          disputes={disputes} envelopes={envelopes} events={events}
          agents={registeredAgents}
          isRunning={isRunning} onRun={handleRunMission} onReset={handleReset} onImport={handleImport}
          simulateDispute={simulateDispute} setSimulateDispute={setSimulateDispute}
          simulateTimeout={simulateTimeout} setSimulateTimeout={setSimulateTimeout}
          onGo={go}
        />
      )}
      {view === 'evidence' && <EvidenceTrace claims={claims} evidenceGraph={evidenceGraph} />}
      {view === 'disputes' && <DisputeArena disputes={disputes} claims={claims} />}
      {view === 'verify' && <VerifyLedger claims={claims} evidenceGraph={evidenceGraph} />}
      {view === 'replay' && <ReplayTheater events={events} />}
      {view === 'protocol' && <ProtocolDebugger envelopes={envelopes} />}
      {view === 'agents' && <AgentConstellation agents={registeredAgents} tasks={tasks} />}
      {view === 'command' && mission && (
        <div className="mt-4">
          <Telemetry metrics={metrics} />
        </div>
      )}
      {view === 'command' && history.length > 0 && (
        <div className="mt-4 cs-panel px-4 py-3">
          <div className="cs-label mb-2">Mission history · local</div>
          <div className="space-y-1">
            {history.map((h) => (
              <div key={h.mission_id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="text-white truncate">{h.objective.slice(0, 80)}</span>
                <span className="flex items-center gap-2 shrink-0 text-[#5d6474]">
                  <span>{h.status}</span>
                  <span>{new Date(h.at).toLocaleDateString()}</span>
                  <span className="text-[#3d4350]">{h.mission_id}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </MissionShell>
  );
}
