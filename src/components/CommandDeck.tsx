'use client';

import React, { useRef, useState } from 'react';
import { Play, RotateCcw, AlertTriangle, Clock, CheckCircle2, FlaskConical, Download, Upload } from 'lucide-react';
import { exportMission } from '../core/persistence/index';
import { SwarmGraph } from './SwarmGraph';
import { Did, StateDot, GroundedNote } from './primitives';
import type { Mission, FinalReport } from '../core/types/mission';
import type { Task } from '../core/types/task';
import type { Claim } from '../core/types/claims';
import type { Evidence } from '../core/types/evidence';
import type { Dispute } from '../core/types/verification';
import type { CoreSwarmEnvelope } from '../core/types/protocol';
import type { CoreSwarmEvent } from '../core/types/events';
import type { AgentMetadata } from '../core/types/agent';
import type { SystemMetrics } from '../core/orchestrator/metrics';

/* ================= Launch console (pre-mission) ================= */

function LaunchConsole({
  isRunning, onRun, onReset, simulateDispute, setSimulateDispute,
  simulateTimeout, setSimulateTimeout, completed,
}: {
  isRunning: boolean;
  onRun: (o: { simulateDispute: boolean; simulateTimeout: boolean }) => void;
  onReset: () => void;
  simulateDispute: boolean;
  setSimulateDispute: (v: boolean) => void;
  simulateTimeout: boolean;
  setSimulateTimeout: (v: boolean) => void;
  completed: boolean;
}) {
  return (
    <div className="cs-panel cs-noise overflow-hidden">
      <div className="cs-grid-bg absolute inset-0 opacity-70" />
      <div className="relative px-6 py-8 md:px-10 md:py-10 max-w-3xl">
        <div className="cs-label mb-2">Primary reference mission</div>
        <h1 className="font-display text-2xl md:text-[32px] font-bold tracking-tight text-white leading-tight">
          Technocore Integration Auditor
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8b93a5] max-w-xl">
          Audit this project to verify protocol correctness — Ed25519 DID, single-line
          sweeping, CAS notes, replay protection — identify risks, and produce
          traceable evidence for every conclusion.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.14em] text-[#5d6474] uppercase">
            <FlaskConical className="w-3 h-3" /> chaos scenarios
          </span>
          {([
            { v: simulateDispute, s: setSimulateDispute, icon: <AlertTriangle className="w-3.5 h-3.5 text-[#fcd34d]" />, label: 'Dispute', hint: 'Inject a contradictory claim for adjudication' },
            { v: simulateTimeout, s: setSimulateTimeout, icon: <Clock className="w-3.5 h-3.5 text-[#fda4af]" />, label: 'Timeout', hint: 'Force TIMEOUT → REASSIGNED recovery' },
          ] as const).map((t) => (
            <label
              key={t.label}
              title={t.hint}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-[11px] border transition-all ${
                isRunning ? 'opacity-50 cursor-not-allowed bg-[#0e1118] border-[#1c212c] text-[#5d6474]'
                : t.v ? 'cursor-pointer bg-[#fcd34d]/5 border-[#fcd34d]/30 text-white'
                : 'cursor-pointer bg-[#0e1118] border-[#1c212c] text-[#8b93a5] hover:border-[#343b4c]'
              }`}
            >
              <input type="checkbox" checked={t.v} onChange={(e) => t.s(e.target.checked)} disabled={isRunning} className="sr-only" />
              <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${t.v ? 'bg-[#fcd34d]/70' : 'bg-[#262c39]'}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${t.v ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </span>
              {t.icon}<span>{t.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRun({ simulateDispute, simulateTimeout })}
            disabled={isRunning}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-[12px] font-semibold tracking-wide transition-all ${
              isRunning
                ? 'bg-[#131722] text-[#5d6474] border border-[#1c212c] cursor-not-allowed'
                : 'bg-[#7dd3fc] text-[#060709] hover:bg-[#a5e3ff] active:scale-[0.98]'
            }`}
          >
            {isRunning ? (
              <><span className="w-3.5 h-3.5 border-2 border-[#5d6474] border-t-transparent rounded-full animate-spin" />EXECUTING MISSION…</>
            ) : completed ? (
              <><CheckCircle2 className="w-4 h-4" />RUN MISSION AGAIN</>
            ) : (
              <><Play className="w-4 h-4 fill-current" />LAUNCH AUTONOMOUS AUDIT</>
            )}
          </button>
          <button
            onClick={onReset}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-md font-mono text-[11px] text-[#8b93a5] hover:text-white border border-[#1c212c] hover:bg-[#131722] transition-all disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Coverage strip (not stat cards) ================= */

function CoverageStrip({ mission, metrics }: { mission: Mission | null; metrics: SystemMetrics }) {
  const totalClaims = mission ? Object.keys(mission.claims).length : 0;
  const verified = mission ? Object.values(mission.claims).filter((c) => c.verification_status === 'VERIFIED').length : 0;
  const pct = totalClaims > 0 ? Math.round((verified / totalClaims) * 100) : 0;
  const items: Array<[string, string, string]> = [
    ['tasks', mission ? `${Object.values(mission.tasks).filter((t) => t.status === 'COMPLETED').length}/${Object.keys(mission.tasks).length}` : '—', 'DAG'],
    ['evidence', `${metrics.evidenceCount}`, 'extracts'],
    ['packets', `${metrics.messageCount}`, 'coreswarm/1'],
    ['disputes', `${metrics.disputeCount}`, 'adjudicated'],
    ['retries', `${metrics.retries}`, `fail ${metrics.taskFailures} · t/o ${metrics.timeouts}`],
  ];
  return (
    <div className="cs-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2 min-w-[180px] flex-1">
          <span className="cs-label shrink-0">Coverage</span>
          <div className="flex-1 h-1 rounded-full bg-[#131722] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#7dd3fc] to-[#5eead4] transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-[12px] font-semibold text-[#5eead4] tabular-nums">{totalClaims ? `${verified}/${totalClaims}` : '—'}</span>
        </div>
        {items.map(([k, v, s]) => (
          <div key={k} className="flex items-baseline gap-1.5 font-mono">
            <span className="text-[10px] tracking-[0.12em] text-[#5d6474] uppercase">{k}</span>
            <span className="text-[13px] font-semibold text-white tabular-nums">{v}</span>
            <span className="text-[10px] text-[#3d4350]">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= LEFT: task structure ================= */

function TaskStructure({ tasks }: { tasks: Record<string, Task> }) {
  const list = Object.values(tasks);
  const roots = list.filter((t) => t.dependencies.length === 0);
  const mids = list.filter((t) => t.dependencies.length > 0 && t.type !== 'VERIFICATION');
  const verifs = list.filter((t) => t.type === 'VERIFICATION');
  const tiers: Array<{ name: string; items: Task[] }> = [
    { name: 'DISCOVERY', items: roots },
    { name: 'ANALYSIS', items: mids },
    { name: 'VERIFICATION', items: verifs },
  ].filter((t) => t.items.length > 0);

  if (list.length === 0) {
    return (
      <div className="cs-panel p-5 text-center">
        <div className="font-mono text-[11px] text-[#5d6474]">No task structure yet.<br />Launch a mission to decompose the DAG.</div>
      </div>
    );
  }

  return (
    <div className="cs-panel p-4">
      <div className="cs-label mb-3">Mission ↓ Task Structure</div>
      <div className="space-y-4">
        {tiers.map((tier, ti) => (
          <div key={tier.name}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1 h-1 rounded-full bg-[#7dd3fc]" />
              <span className="font-mono text-[10px] tracking-[0.14em] text-[#8b93a5]">{tier.name}</span>
              {ti < tiers.length - 1 || true ? null : null}
            </div>
            <div className="space-y-1.5 border-l border-[#1c212c] ml-0.5 pl-3">
              {tier.items.map((t) => (
                <div key={t.task_id} className="group rounded-md border border-[#1c212c] bg-[#0e1118] px-2.5 py-2 hover:border-[#343b4c] transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium text-white truncate">{t.title}</span>
                    <StateDot state={t.status === 'COMPLETED' || t.status === 'VERIFIED' ? 'COMPLETED' : t.status === 'EXECUTING' ? 'EXECUTING' : t.status === 'VERIFYING' ? 'VERIFYING' : t.status === 'DISPUTED' ? 'DISPUTED' : t.status === 'FAILED' || t.status === 'TIMEOUT' ? 'FAILED' : 'IDLE'} size="sm" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-[#5d6474]">
                    <span className="text-[#a78bfa]">{t.assigned_agent ?? 'unassigned'}</span>
                    <span>{t.status}</span>
                    {t.attempt > 1 && <span className="text-[#fcd34d]">try {t.attempt}</span>}
                    {t.dependencies.length > 0 && <span>← {t.dependencies.join(', ')}</span>}
                  </div>
                </div>
              ))}
            </div>
            {ti < tiers.length - 1 && <div className="ml-0.5 pl-3 font-mono text-[10px] text-[#3d4350] py-0.5">↓</div>}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="w-1 h-1 rounded-full bg-[#5eead4]" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-[#5eead4]/80">FINAL SYNTHESIS</span>
        </div>
      </div>
    </div>
  );
}

/* ================= RIGHT: protocol stream ================= */

const EVENT_TONE: Record<string, string> = {
  TASK_RESULT: 'text-[#5eead4]', MISSION_COMPLETED: 'text-[#5eead4]', VERIFICATION_COMPLETED: 'text-[#5eead4]',
  DISPUTE_CREATED: 'text-[#fcd34d]', REVISION_REQUESTED: 'text-[#fcd34d]',
  TASK_FAILED: 'text-[#fda4af]', TASK_REASSIGNED: 'text-[#7dd3fc]',
  TASK_STARTED: 'text-[#7dd3fc]', TASK_DELEGATED: 'text-[#a78bfa]', TASK_RESULT_SUBMITTED: 'text-[#5eead4]',
};

function ProtocolStream({ events }: { events: readonly CoreSwarmEvent[] }) {
  const tail = events.slice(-40).reverse();
  return (
    <div className="cs-panel p-4 flex flex-col min-h-[300px]">
      <div className="flex items-center justify-between mb-3">
        <span className="cs-label">Live protocol stream</span>
        <span className="font-mono text-[10px] text-[#3d4350] tabular-nums">{events.length} events</span>
      </div>
      <div className="cs-scroll flex-1 overflow-y-auto max-h-[520px] space-y-px font-mono text-[11px]">
        {tail.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-[#3d4350]">
            Awaiting mission.<br />Protocol transactions will stream here.
          </div>
        ) : (
          tail.map((e) => (
            <div key={e.event_id} className="cs-row-in flex items-start gap-2 px-1.5 py-[5px] rounded hover:bg-[#0e1118]">
              <span className="text-[#3d4350] tabular-nums shrink-0 text-[10px] pt-px">
                {new Date(e.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
              </span>
              <div className="min-w-0">
                <div className={`font-semibold tracking-wide text-[10.5px] ${EVENT_TONE[e.event_type] ?? 'text-[#b8c0cf]'}`}>
                  {e.event_type}
                </div>
                <div className="text-[10px] text-[#5d6474] truncate">
                  {e.actor_id}{e.task_id ? ` · ${e.task_id}` : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================= Report synthesis ================= */

function Synthesis({ report, onGo }: { report: FinalReport; onGo: (v: 'evidence' | 'disputes' | 'replay') => void }) {
  return (
    <div className="cs-panel p-5 md:p-6 space-y-5 cs-rise">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b cs-hairline pb-4">
        <div>
          <div className="cs-label mb-1">Audit report synthesis</div>
          <div className="font-display text-base font-semibold text-white">Mission complete — conclusions with provenance</div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="px-2 py-0.5 rounded border border-[#5eead4]/25 bg-[#5eead4]/5 text-[#5eead4]">{report.verified_claims.length} grounded</span>
          <span className="px-2 py-0.5 rounded border border-[#fcd34d]/25 bg-[#fcd34d]/5 text-[#fcd34d]">{report.disputes_resolved.length} disputes</span>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-[#e8eaf0] rounded-md border border-[#1c212c] bg-[#0e1118] p-4">
        {report.executive_summary}
      </p>
      <GroundedNote />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border border-[#1c212c] bg-[#0e1118] p-4">
          <div className="font-mono text-[10px] tracking-[0.14em] text-[#fda4af] uppercase mb-2">Protocol risks ({report.protocol_risks.length})</div>
          <ul className="space-y-1.5 text-[12px] text-[#b8c0cf]">
            {report.protocol_risks.map((r, i) => <li key={i} className="flex gap-2"><span className="text-[#fda4af]">·</span>{r}</li>)}
          </ul>
        </div>
        <div className="rounded-md border border-[#1c212c] bg-[#0e1118] p-4">
          <div className="font-mono text-[10px] tracking-[0.14em] text-[#5eead4] uppercase mb-2">Recommendations ({report.recommendations.length})</div>
          <ul className="space-y-1.5 text-[12px] text-[#b8c0cf]">
            {report.recommendations.map((r, i) => <li key={i} className="flex gap-2"><span className="text-[#5eead4]">·</span>{r}</li>)}
          </ul>
        </div>
      </div>
      {report.unresolved_uncertainties.length > 0 && (
        <div className="rounded-md border border-[#fcd34d]/25 bg-[#fcd34d]/5 p-4">
          <div className="font-mono text-[10px] tracking-[0.14em] text-[#fcd34d] uppercase mb-2">Unresolved uncertainties</div>
          <ul className="space-y-1 text-[12px] text-[#b8c0cf]">
            {report.unresolved_uncertainties.map((u, i) => <li key={i} className="flex gap-2"><span className="text-[#fcd34d]">·</span>{u}</li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-4 font-mono text-[11px]">
        {([['evidence', 'Trace provenance →'], ['disputes', 'Inspect disputes →'], ['replay', 'Replay timeline →']] as const).map(([v, l]) => (
          <button key={v} onClick={() => onGo(v)} className="text-[#7dd3fc] hover:text-white transition-colors">{l}</button>
        ))}
      </div>
    </div>
  );
}

/* ================= Persistence: export / import ================= */

function PersistenceControls({
  mission, events, isRunning, onImport,
}: {
  mission: Mission;
  events: readonly CoreSwarmEvent[];
  isRunning: boolean;
  onImport: (data: unknown) => string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportMission(mission, events), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mission.mission_id}.coreswarm.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImportFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as unknown;
      const err = onImport(data);
      setNotice(err ?? `Imported ${mission.mission_id} — cross-check passed.`);
    } catch {
      setNotice('Import failed: not valid JSON.');
    }
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={doExport} disabled={isRunning}
        title="Download mission as portable JSON (mission + event log)"
        className="flex items-center gap-1.5 px-3 py-2 rounded-md font-mono text-[11px] text-[#8b93a5] hover:text-white border border-[#1c212c] hover:bg-[#131722] disabled:opacity-40"
      >
        <Download className="w-3.5 h-3.5" />Export
      </button>
      <button
        onClick={() => fileRef.current?.click()} disabled={isRunning}
        title="Load a previously exported mission (replay cross-checked)"
        className="flex items-center gap-1.5 px-3 py-2 rounded-md font-mono text-[11px] text-[#8b93a5] hover:text-white border border-[#1c212c] hover:bg-[#131722] disabled:opacity-40"
      >
        <Upload className="w-3.5 h-3.5" />Import
      </button>
      <input
        ref={fileRef} type="file" accept="application/json,.json" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImportFile(f);
          e.target.value = '';
        }}
      />
      {notice && <span className="font-mono text-[10px] text-[#7dd3fc]">{notice}</span>}
    </span>
  );
}

/* ================= Command deck ================= */

interface CommandDeckProps {
  mission: Mission | null;
  report: FinalReport | null;
  metrics: SystemMetrics;
  tasks: Record<string, Task>;
  claims: Record<string, Claim>;
  evidenceGraph: Record<string, Evidence>;
  disputes: Record<string, Dispute>;
  envelopes: CoreSwarmEnvelope[];
  events: readonly CoreSwarmEvent[];
  agents: AgentMetadata[];
  isRunning: boolean;
  onRun: (o: { simulateDispute: boolean; simulateTimeout: boolean }) => void;
  onReset: () => void;
  onImport: (data: unknown) => string | null;
  simulateDispute: boolean;
  setSimulateDispute: (v: boolean) => void;
  simulateTimeout: boolean;
  setSimulateTimeout: (v: boolean) => void;
  onGo: (v: 'evidence' | 'disputes' | 'replay') => void;
}

export function CommandDeck(props: CommandDeckProps) {
  const { mission, report, metrics, tasks, claims, evidenceGraph, disputes, envelopes, events, agents, isRunning } = props;
  return (
    <div className="space-y-4">
      {!mission && (
        <LaunchConsole
          isRunning={isRunning} onRun={props.onRun} onReset={props.onReset}
          simulateDispute={props.simulateDispute} setSimulateDispute={props.setSimulateDispute}
          simulateTimeout={props.simulateTimeout} setSimulateTimeout={props.setSimulateTimeout}
          completed={false}
        />
      )}

      {mission && (
        <>
          <CoverageStrip mission={mission} metrics={metrics} />
          {/* Three-layer operational layout */}
          <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_300px] gap-4 items-start">
            <div className="order-2 xl:order-1"><TaskStructure tasks={tasks} /></div>
            <div className="order-1 xl:order-2 space-y-4">
              <SwarmGraph
                tasks={tasks} claims={claims} evidenceGraph={evidenceGraph}
                disputes={disputes} envelopes={envelopes} agents={agents}
                missionStatus={mission.status} height={440}
              />
              {/* Inline mission controls during/after run */}
              <div className="cs-panel px-4 py-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => props.onRun({ simulateDispute: props.simulateDispute, simulateTimeout: props.simulateTimeout })}
                  disabled={isRunning}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[11px] font-semibold transition-all ${
                    isRunning ? 'bg-[#131722] text-[#5d6474] border border-[#1c212c] cursor-not-allowed'
                    : 'bg-[#7dd3fc] text-[#060709] hover:bg-[#a5e3ff] active:scale-[0.98]'
                  }`}
                >
                  {isRunning ? 'EXECUTING…' : mission.status === 'COMPLETED' ? 'RUN AGAIN' : 'LAUNCH'}
                </button>
                <button
                  onClick={props.onReset} disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md font-mono text-[11px] text-[#8b93a5] hover:text-white border border-[#1c212c] hover:bg-[#131722] disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />Reset
                </button>
                <PersistenceControls
                  mission={mission} events={events} isRunning={isRunning} onImport={props.onImport}
                />
                <span className="ml-auto font-mono text-[10px] text-[#3d4350] hidden md:inline">
                  {mission.mission_id} · {Object.keys(agents).length || agents.length} agents · {Object.keys(disputes).length} disputes
                </span>
              </div>
            </div>
            <div className="order-3"><ProtocolStream events={events} /></div>
          </div>
        </>
      )}

      {report && <Synthesis report={report} onGo={props.onGo} />}

      {/* Agent identities strip */}
      {agents.length > 0 && mission && (
        <div className="cs-panel px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {agents.map((a) => (
              <div key={a.agent_id} className="flex items-center gap-2 font-mono text-[11px]">
                <StateDot state={a.availability === 'AVAILABLE' ? 'IDLE' : 'ACTIVE'} size="sm" />
                <span className="text-white font-medium">{a.agent_id}</span>
                <Did value={a.did} className="text-[10px] max-w-[150px]" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
