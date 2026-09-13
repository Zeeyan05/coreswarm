'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../core/types/task';
import type { Claim } from '../core/types/claims';
import type { Evidence } from '../core/types/evidence';
import type { Dispute } from '../core/types/verification';
import type { CoreSwarmEnvelope } from '../core/types/protocol';
import type { AgentMetadata } from '../core/types/agent';

/**
 * The Swarm Graph — CoreSwarm's signature visual.
 * A living network of the ACTUAL mission state: orchestrator, agents, tasks,
 * evidence and claims as connected nodes. Edges animate when protocol events
 * occur. Node motion communicates state, not just color.
 *
 * No fabricated activity: every node/edge derives from backend props.
 */

interface SwarmGraphProps {
  tasks: Record<string, Task>;
  claims: Record<string, Claim>;
  evidenceGraph: Record<string, Evidence>;
  disputes: Record<string, Dispute>;
  envelopes: CoreSwarmEnvelope[];
  agents: AgentMetadata[];
  missionStatus?: string;
  height?: number;
}

interface GNode {
  id: string;
  kind: 'orchestrator' | 'agent' | 'task' | 'evidence' | 'claim';
  label: string;
  sub: string;
  state: string;
  x: number;
  y: number;
}

interface GEdge {
  id: string;
  from: string;
  to: string;
  active: boolean;
  disputed: boolean;
}

interface Particle {
  id: number;
  edgeId: string;
  born: number;
  duration: number;
  label?: string;
}

const AGENT_SHORT: Record<string, string> = {
  'researcher-01': 'RES',
  'analyst-01': 'ANL',
  'verifier-01': 'VER',
  'synthesizer-01': 'SYN',
};

function taskState(task: Task): string {
  if (task.status === 'FAILED' || task.status === 'TIMEOUT') return 'FAILED';
  if (task.status === 'DISPUTED') return 'DISPUTED';
  if (task.status === 'COMPLETED' || task.status === 'VERIFIED') return 'COMPLETED';
  if (task.status === 'EXECUTING' || task.status === 'RESULT_SUBMITTED') return 'EXECUTING';
  if (task.status === 'VERIFYING' || task.status === 'REVISION_REQUESTED') return 'VERIFYING';
  return 'IDLE';
}

const NODE_R: Record<GNode['kind'], number> = {
  orchestrator: 26,
  agent: 20,
  task: 13,
  evidence: 7,
  claim: 8,
};

export function SwarmGraph({
  tasks, claims, evidenceGraph, disputes, envelopes, agents, missionStatus, height = 460,
}: SwarmGraphProps) {
  const [now, setNow] = useState(() => Date.now());
  const particleId = useRef(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const lastEnvelopeRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  const W = 760;
  const H = height;

  /* ----- Build graph from REAL state ----- */
  const { nodes, edges, nodeById } = useMemo(() => {
    const ns: GNode[] = [];
    const es: GEdge[] = [];
    const byId = new Map<string, GNode>();

    const cx = W / 2;
    // Orchestrator at top
    const orch: GNode = {
      id: 'orchestrator', kind: 'orchestrator', label: 'ORCHESTRATOR', sub: 'mission control',
      state: !missionStatus ? 'IDLE' : missionStatus === 'COMPLETED' ? 'COMPLETED' : missionStatus === 'FAILED' ? 'FAILED' : 'EXECUTING',
      x: cx, y: 52,
    };
    ns.push(orch); byId.set(orch.id, orch);

    // Agents in a row
    const agentList = agents.length > 0 ? agents : [];
    const ax = (i: number) => cx + (i - (agentList.length - 1) / 2) * 150;
    agentList.forEach((a, i) => {
      const busyTasks = Object.values(tasks).filter((t) => t.assigned_agent === a.agent_id && (t.status === 'EXECUTING' || t.status === 'VERIFYING')).length;
      const failedTasks = Object.values(tasks).filter((t) => t.assigned_agent === a.agent_id && (t.status === 'FAILED' || t.status === 'TIMEOUT')).length;
      const n: GNode = {
        id: a.agent_id, kind: 'agent',
        label: AGENT_SHORT[a.agent_id] ?? a.agent_id.slice(0, 3).toUpperCase(),
        sub: a.agent_id,
        state: failedTasks > 0 ? 'FAILED' : busyTasks > 0 ? 'EXECUTING' : a.availability === 'BUSY' ? 'EXECUTING' : 'IDLE',
        x: ax(i), y: 168,
      };
      ns.push(n); byId.set(n.id, n);
      es.push({ id: `e-orch-${a.agent_id}`, from: 'orchestrator', to: a.agent_id, active: busyTasks > 0, disputed: false });
    });

    // Tasks row
    const taskList = Object.values(tasks);
    const tx = (i: number) => cx + (i - (taskList.length - 1) / 2) * Math.min(150, 620 / Math.max(1, taskList.length));
    taskList.forEach((t, i) => {
      const st = taskState(t);
      const n: GNode = {
        id: t.task_id, kind: 'task', label: t.task_id.replace('task_', '').slice(0, 10), sub: t.status,
        state: st, x: tx(i), y: 282,
      };
      ns.push(n); byId.set(n.id, n);
      if (t.assigned_agent && byId.has(t.assigned_agent)) {
        es.push({ id: `e-${t.assigned_agent}-${t.task_id}`, from: t.assigned_agent, to: t.task_id, active: st === 'EXECUTING' || st === 'VERIFYING', disputed: st === 'DISPUTED' || st === 'FAILED' });
      }
      for (const dep of t.dependencies) {
        if (byId.has(dep)) es.push({ id: `e-dep-${dep}-${t.task_id}`, from: dep, to: t.task_id, active: false, disputed: false });
      }
    });

    // Evidence + claims constellation (bottom)
    const evList = Object.values(evidenceGraph).slice(0, 14);
    const claimList = Object.values(claims).slice(0, 10);
    evList.forEach((e, i) => {
      const n: GNode = {
        id: e.evidence_id, kind: 'evidence', label: 'EV', sub: e.source.split('/').pop() ?? e.source,
        state: 'IDLE', x: 90 + (i % 7) * 96, y: 372 + Math.floor(i / 7) * 30,
      };
      ns.push(n); byId.set(n.id, n);
    });
    claimList.forEach((c, i) => {
      const n: GNode = {
        id: c.claim_id, kind: 'claim',
        label: c.verification_status === 'VERIFIED' ? '✓' : c.verification_status === 'CONTRADICTED' ? '✕' : '?',
        sub: c.verification_status,
        state: c.verification_status === 'VERIFIED' ? 'COMPLETED' : c.verification_status === 'CONTRADICTED' ? 'DISPUTED' : 'VERIFYING',
        x: 120 + (i % 5) * 130, y: 418,
      };
      ns.push(n); byId.set(n.id, n);
      for (const ref of c.evidence_refs) {
        if (byId.has(ref)) es.push({ id: `e-${ref}-${c.claim_id}`, from: ref, to: c.claim_id, active: false, disputed: c.verification_status === 'CONTRADICTED' });
      }
      // Link claim to its origin task
      if (byId.has(c.origin_task_id)) es.push({ id: `e-${c.origin_task_id}-${c.claim_id}`, from: c.origin_task_id, to: c.claim_id, active: false, disputed: false });
    });

    // Verifier edges for disputed claims
    for (const d of Object.values(disputes)) {
      if (d.status === 'RESOLVED') continue;
      if (byId.has('verifier-01') && byId.has(d.claim_id)) {
        es.push({ id: `e-disp-${d.dispute_id}`, from: 'verifier-01', to: d.claim_id, active: true, disputed: true });
      }
    }

    return { nodes: ns, edges: es, nodeById: byId };
  }, [tasks, claims, evidenceGraph, disputes, agents, missionStatus]);

  /* ----- Particles from REAL envelope arrivals ----- */
  useEffect(() => {
    if (envelopes.length <= lastEnvelopeRef.current) return;
    const fresh = envelopes.slice(lastEnvelopeRef.current);
    lastEnvelopeRef.current = envelopes.length;

    const agentOf = (id: string) => {
      if (id === 'orchestrator') return 'orchestrator';
      if (nodeById.has(id)) return id;
      return null;
    };

    const born = Date.now();
    const next: Particle[] = [];
    for (const env of fresh.slice(-6)) {
      const from = agentOf(env.sender.agent_id);
      const to = agentOf(env.recipient.agent_id);
      if (!from || !to) continue;
      const edge = edges.find((e) => e.from === from && e.to === to)
        ?? edges.find((e) => e.from === to && e.to === from);
      if (!edge) continue;
      next.push({
        id: particleId.current++,
        edgeId: edge.id,
        born,
        duration: 1100,
        label: env.message_type,
      });
    }
    if (next.length > 0) setParticles((p) => [...p.slice(-24), ...next]);
  }, [envelopes, edges, nodeById]);

  /* ----- Frame loop: expire particles, tick clock ----- */
  useEffect(() => {
    const t = setInterval(() => {
      const tnow = Date.now();
      setNow(tnow);
      setParticles((p) => (p.length > 0 ? p.filter((pt) => tnow - pt.born < pt.duration + 100) : p));
    }, 90);
    return () => clearInterval(t);
  }, []);

  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  const nodeFill = (n: GNode) => {
    switch (n.state) {
      case 'EXECUTING': return '#7dd3fc';
      case 'VERIFYING': return '#a78bfa';
      case 'DISPUTED': return '#fcd34d';
      case 'COMPLETED': return '#5eead4';
      case 'FAILED': return '#fda4af';
      default: return '#3d4350';
    }
  };

  const hovered = hover ? nodeById.get(hover) : null;

  return (
    <div className="relative w-full overflow-hidden rounded-[10px] border border-[#1c212c] bg-[#060709]">
      <div className="cs-grid-bg absolute inset-0" />
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="relative w-full" style={{ height: H }}>
        <defs>
          <filter id="cs-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((e) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          const isHover = hover === e.from || hover === e.to;
          const stroke = e.disputed ? '#fcd34d' : e.active ? '#7dd3fc' : isHover ? '#343b4c' : '#232936';
          return (
            <line
              key={e.id}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={stroke}
              strokeWidth={e.active || e.disputed ? 1.4 : 1}
              opacity={e.active || e.disputed ? 0.85 : isHover ? 0.8 : 0.45}
              className={e.active || e.disputed ? 'cs-edge-active' : 'cs-edge'}
              style={e.disputed ? { strokeDasharray: '2 5' } : undefined}
            />
          );
        })}

        {/* Particles: real protocol messages in flight */}
        {particles.map((p) => {
          const e = edgeById.get(p.edgeId);
          if (!e) return null;
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          const t = Math.min(1, (now - p.born) / p.duration);
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
          return (
            <g key={p.id} opacity={fade} filter="url(#cs-glow)">
              <circle cx={x} cy={y} r={3} fill="#7dd3fc" />
              {p.label && t < 0.7 && (
                <text x={x + 7} y={y - 6} fill="#7dd3fc" fontSize={8} fontFamily="JetBrains Mono, monospace" opacity={0.9}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const r = NODE_R[n.kind];
          const fill = nodeFill(n);
          const dim = n.state === 'IDLE' && n.kind !== 'orchestrator';
          const isH = hover === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              opacity={dim && !isH ? 0.55 : 1}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {(n.state === 'EXECUTING' || n.state === 'VERIFYING') && (
                <circle r={r + 5} fill="none" stroke={fill} strokeWidth={1} className="cs-node-ping" />
              )}
              {n.state === 'VERIFYING' && n.kind !== 'claim' && n.kind !== 'evidence' && (
                <circle r={r + 9} fill="none" stroke={fill} strokeWidth={0.8} opacity={0.5} className="cs-sweep-rotate" strokeDasharray="8 14" />
              )}
              {(n.state === 'DISPUTED' || n.state === 'FAILED') && (
                <circle r={r + 4} fill="none" stroke={fill} strokeWidth={1.2} className="cs-alert-blink" />
              )}
              <circle
                r={r}
                fill="#0b0d12"
                stroke={fill}
                strokeWidth={n.kind === 'orchestrator' || n.kind === 'agent' ? 1.6 : 1.1}
                opacity={n.kind === 'evidence' || n.kind === 'claim' ? 0.9 : 1}
                filter={n.kind === 'orchestrator' || n.kind === 'agent' ? 'url(#cs-glow)' : undefined}
              />
              <circle r={2.2} fill={fill} />
              <text
                y={n.kind === 'evidence' || n.kind === 'claim' ? r + 11 : r + 14}
                textAnchor="middle"
                fill={isH ? '#e8eaf0' : '#8b93a5'}
                fontSize={n.kind === 'orchestrator' ? 9 : 8.5}
                fontWeight={n.kind === 'orchestrator' || n.kind === 'agent' ? 600 : 400}
                fontFamily="JetBrains Mono, monospace"
                letterSpacing="0.08em"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover inspector: real values only */}
      <div className="absolute left-3 bottom-3 min-w-[210px] max-w-[300px] rounded-lg border border-[#262c39] bg-[#0b0d12]/95 px-3 py-2 backdrop-blur">
        {hovered ? (
          <div className="space-y-0.5">
            <div className="font-mono text-[11px] font-semibold text-white">{hovered.sub}</div>
            <div className="font-mono text-[10px] text-[#5d6474]">
              {hovered.kind.toUpperCase()} · <span className="text-[#b8c0cf]">{hovered.state}</span>
            </div>
          </div>
        ) : (
          <div className="font-mono text-[10px] text-[#5d6474]">
            {nodes.length} nodes · {edges.length} links · {particles.length} in flight
            <span className="block text-[#3d4350]">hover a node to inspect</span>
          </div>
        )}
      </div>

      {/* Legend: motion semantics */}
      <div className="absolute right-3 top-3 flex items-center gap-3 rounded-lg border border-[#1c212c] bg-[#0b0d12]/90 px-2.5 py-1.5 font-mono text-[9px] text-[#5d6474] backdrop-blur">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#7dd3fc] cs-breathe" />active</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] cs-breathe" />verifying</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#fcd34d] cs-alert-blink" />disputed</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#5eead4]" />grounded</span>
      </div>
    </div>
  );
}
