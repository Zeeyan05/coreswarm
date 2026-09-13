'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/* ---------- Cryptographic identity: compact DID ---------- */

export function Did({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className={`font-mono text-[#5d6474] ${className}`}>—</span>;
  const short = value.length > 20 ? `${value.slice(0, 13)}…${value.slice(-6)}` : value;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={value}
      className={`group inline-flex items-center gap-1 font-mono text-[#a78bfa] hover:text-[#c4b5fd] transition-colors ${className}`}
    >
      <span className="truncate">{short}</span>
      {copied
        ? <Check className="w-3 h-3 text-[#5eead4] shrink-0" />
        : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0" />}
    </button>
  );
}

/* ---------- Semantic state dot: motion + shape, not just color ---------- */

export type SemanticState =
  | 'IDLE' | 'DISCOVERING' | 'EXECUTING' | 'VERIFYING' | 'DISPUTED'
  | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'ACTIVE' | 'STALE';

const STATE_STYLE: Record<SemanticState, { dot: string; ring?: string; motion: string }> = {
  IDLE: { dot: 'bg-[#3d4350]', motion: '' },
  DISCOVERING: { dot: 'bg-[#7dd3fc]', motion: 'cs-breathe' },
  EXECUTING: { dot: 'bg-[#7dd3fc]', ring: 'cs-node-ping', motion: '' },
  ACTIVE: { dot: 'bg-[#7dd3fc]', ring: 'cs-node-ping', motion: '' },
  VERIFYING: { dot: 'bg-[#a78bfa]', motion: 'cs-breathe' },
  DISPUTED: { dot: 'bg-[#fcd34d]', ring: 'cs-alert-blink', motion: '' },
  COMPLETED: { dot: 'bg-[#5eead4]', motion: '' },
  FAILED: { dot: 'bg-[#fda4af]', ring: 'cs-alert-blink', motion: '' },
  TIMEOUT: { dot: 'bg-[#fda4af]', ring: 'cs-alert-blink', motion: '' },
  STALE: { dot: 'bg-[#3d4350]', motion: '' },
};

export function StateDot({ state, size = 'md' }: { state: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = (STATE_STYLE[state as SemanticState] ?? STATE_STYLE.IDLE)!;
  const px = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  return (
    <span className={`relative inline-flex shrink-0 ${px}`}>
      {s.ring && (
        <span className={`absolute inline-flex w-full h-full rounded-full ${s.dot} ${s.ring === 'cs-node-ping' ? 'cs-node-ping' : 'cs-alert-blink'}`} />
      )}
      <span className={`relative inline-flex rounded-full w-full h-full ${s.dot} ${s.motion}`} />
    </span>
  );
}

export function StateTag({ state }: { state: string }) {
  const color =
    state === 'COMPLETED' || state === 'VERIFIED' ? 'text-[#5eead4] border-[#5eead4]/25 bg-[#5eead4]/5' :
    state === 'EXECUTING' || state === 'ACTIVE' ? 'text-[#7dd3fc] border-[#7dd3fc]/25 bg-[#7dd3fc]/5' :
    state === 'VERIFYING' || state === 'VERIFYING_CLAIM' ? 'text-[#a78bfa] border-[#a78bfa]/25 bg-[#a78bfa]/5' :
    state === 'DISPUTED' || state === 'OPEN' ? 'text-[#fcd34d] border-[#fcd34d]/25 bg-[#fcd34d]/5' :
    state === 'FAILED' || state === 'TIMEOUT' || state === 'CONTRADICTED' ? 'text-[#fda4af] border-[#fda4af]/25 bg-[#fda4af]/5' :
    'text-[#8b93a5] border-[#262c39] bg-[#0e1118]';
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[10px] font-mono tracking-wide ${color}`}>
      <StateDot state={state} size="sm" />
      {state}
    </span>
  );
}

/* ---------- Mission lifecycle backbone ---------- */

export const LIFECYCLE = [
  'DISCOVER', 'DECOMPOSE', 'DELEGATE', 'EXECUTE', 'VERIFY', 'RESOLVE', 'SYNTHESIZE',
] as const;

const STATUS_TO_PHASE: Record<string, number> = {
  CREATED: -1, PLANNING: 1, DISCOVERY: 0, DELEGATING: 2, EXECUTING: 3,
  COLLECTING: 3, VERIFYING: 4, RESOLVING: 5, SYNTHESIZING: 6, COMPLETED: 7,
  FAILED: -2, ABORTED: -2,
};

export function LifecycleRail({ status, compact = false }: { status?: string; compact?: boolean }) {
  const activeIdx = status ? (STATUS_TO_PHASE[status] ?? -1) : -1;
  const done = status === 'COMPLETED';
  return (
    <div className="flex items-center gap-0" role="list" aria-label="Mission lifecycle">
      {LIFECYCLE.map((phase, i) => {
        const isActive = i === activeIdx;
        const isDone = done || i < activeIdx;
        const isFailed = activeIdx === -2;
        return (
          <React.Fragment key={phase}>
            <div
              role="listitem"
              title={phase}
              className={`flex items-center gap-1.5 ${compact ? 'px-1' : 'px-2'} py-1 rounded transition-all ${
                isActive
                  ? 'text-[#7dd3fc]'
                  : isDone
                    ? 'text-[#5eead4]/80'
                    : 'text-[#3d4350]'
              }`}
            >
              <span className={`w-1 h-1 rounded-full shrink-0 ${
                isActive ? 'bg-[#7dd3fc] cs-breathe' : isDone ? 'bg-[#5eead4]/70' : 'bg-[#3d4350]'
              }`} />
              {!compact && (
                <span className={`font-mono text-[10px] tracking-[0.12em] ${isActive ? 'font-semibold' : ''}`}>
                  {phase}
                </span>
              )}
              {compact && isActive && (
                <span className="font-mono text-[10px] tracking-[0.12em] font-semibold">{phase}</span>
              )}
            </div>
            {i < LIFECYCLE.length - 1 && (
              <div className={`h-px flex-1 min-w-[6px] ${i < activeIdx || done ? 'bg-[#5eead4]/30' : 'bg-[#1c212c]'}`} />
            )}
            {isFailed && i === 0 && <span className="font-mono text-[10px] text-[#fda4af] ml-1">{status}</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- Verification semantics banner ---------- */

export function GroundedNote({ className = '' }: { className?: string }) {
  return (
    <p className={`font-mono text-[10px] leading-relaxed text-[#5d6474] ${className}`}>
      <span className="text-[#5eead4]">VERIFIED</span> = grounded in cited evidence extracts — not mathematical truth.
    </p>
  );
}

/* ---------- Section heading ---------- */

export function SectionHead({
  kicker, title, right,
}: {
  kicker: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="cs-label mb-1">{kicker}</div>
        <h2 className="font-display text-lg font-600 font-semibold text-white tracking-tight">{title}</h2>
      </div>
      {right}
    </div>
  );
}
