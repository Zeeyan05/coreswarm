'use client';

import React from 'react';
import { Scale, ShieldCheck } from 'lucide-react';
import { StateTag, SectionHead } from './primitives';
import type { Dispute } from '../core/types/verification';
import type { Claim } from '../core/types/claims';

/**
 * Dispute arena: disagreement as a first-class protocol event.
 * Side-by-side real claims → evidence → adjudication → resolution.
 * Originals are never hidden.
 */

const FLOW = ['CONFLICT', 'EVIDENCE', 'ADJUDICATION', 'RESOLUTION'] as const;

export function DisputeArena({ disputes, claims }: { disputes: Record<string, Dispute>; claims: Record<string, Claim> }) {
  const list = Object.values(disputes);
  return (
    <div className="space-y-4">
      <SectionHead
        kicker="Disputes · resolution arena"
        title="Disagreement is a protocol event"
        right={<span className="font-mono text-[11px] text-[#5d6474]">{list.length} dispute{list.length === 1 ? '' : 's'}</span>}
      />

      {list.length === 0 ? (
        <div className="cs-panel p-12 text-center space-y-3">
          <Scale className="w-7 h-7 text-[#3d4350] mx-auto" />
          <h3 className="font-display text-[15px] font-semibold text-white">No disputes recorded</h3>
          <p className="font-mono text-[11px] text-[#5d6474] max-w-md mx-auto leading-relaxed">
            Claims align, or no mission has run. Enable the Dispute chaos scenario to watch live adjudication.
          </p>
        </div>
      ) : (
        list.map((d) => {
          const a = claims[d.claim_id];
          const b = d.counter_claim_id ? claims[d.counter_claim_id] : undefined;
          const stageIdx = d.status === 'RESOLVED' ? 4 : d.status === 'EVIDENCE_REQUESTED' ? 2 : 1;
          return (
            <article key={d.dispute_id} className="cs-panel p-5 md:p-6 space-y-5 cs-rise">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b cs-hairline pb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded border border-[#fcd34d]/30 bg-[#fcd34d]/5 text-[#fcd34d]">{d.dispute_id}</span>
                  <StateTag state={d.status} />
                </div>
                {d.outcome && (
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-[#5d6474]">resolution</span>
                    <span className="px-2 py-0.5 rounded border border-[#5eead4]/30 bg-[#5eead4]/5 text-[#5eead4] font-semibold">{d.outcome}</span>
                  </div>
                )}
              </div>

              {/* Flow rail */}
              <div className="flex items-center gap-0">
                {FLOW.map((s, i) => (
                  <React.Fragment key={s}>
                    <span className={`font-mono text-[10px] tracking-[0.12em] ${i < stageIdx ? 'text-[#5eead4]' : i === stageIdx ? 'text-[#fcd34d] cs-breathe' : 'text-[#3d4350]'}`}>{s}</span>
                    {i < FLOW.length - 1 && <span className={`mx-2 h-px flex-1 ${i < stageIdx ? 'bg-[#5eead4]/30' : 'bg-[#1c212c]'}`} />}
                  </React.Fragment>
                ))}
              </div>

              {/* Reason */}
              <div className="rounded-md border border-[#fcd34d]/20 bg-[#fcd34d]/5 p-3">
                <div className="cs-label !text-[#fcd34d] mb-1">Conflict detected</div>
                <p className="text-[12.5px] text-white leading-relaxed">{d.reason}</p>
              </div>

              {/* Side by side */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                <div className="rounded-md border border-[#1c212c] bg-[#0e1118] p-4 space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[#7dd3fc] font-semibold">{d.claimant_agent}</span>
                    <span className="text-[#3d4350]">{a?.type ?? '—'}</span>
                  </div>
                  <p className="text-[12.5px] text-white leading-relaxed cs-inset p-3">
                    &ldquo;{a?.statement ?? 'Claim record unavailable.'}&rdquo;
                  </p>
                  <div className="font-mono text-[10px] text-[#5d6474]">
                    {a ? `${(a.confidence * 100).toFixed(0)}% self-assessed · ${a.verification_status} · ${a.evidence_refs.length} refs` : '—'}
                  </div>
                </div>
                <div className="flex md:flex-col items-center justify-center gap-1 font-display font-bold text-[#fcd34d] text-lg px-1">VS</div>
                <div className="rounded-md border border-[#1c212c] bg-[#0e1118] p-4 space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[#fda4af] font-semibold">{d.challenger_agent}</span>
                    <span className="text-[#3d4350]">{b?.type ?? '—'}</span>
                  </div>
                  <p className="text-[12.5px] text-white leading-relaxed cs-inset p-3">
                    &ldquo;{b?.statement ?? 'Counter-claim record unavailable.'}&rdquo;
                  </p>
                  <div className="font-mono text-[10px] text-[#5d6474]">
                    {b ? `${(b.confidence * 100).toFixed(0)}% self-assessed · ${b.verification_status} · ${b.evidence_refs.length} refs` : '—'}
                  </div>
                </div>
              </div>

              {/* Counter evidence */}
              {d.counter_evidence.length > 0 && (
                <div className="space-y-1.5">
                  <div className="cs-label">Counter evidence ({d.counter_evidence.length})</div>
                  {d.counter_evidence.slice(0, 3).map((ev) => (
                    <div key={ev.evidence_id} className="font-mono text-[11px] cs-inset p-2.5 text-[#8b93a5]">
                      <span className="text-[#3d4350]">{ev.source} {ev.locator} — </span>
                      <span className="text-[#7dd3fc]">{ev.extract.slice(0, 160)}{ev.extract.length > 160 ? '…' : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Adjudication */}
              {d.adjudication && (
                <div className="rounded-md border border-[#1c212c] border-l-2 border-l-[#5eead4] bg-[#0e1118] p-4 space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-[#5eead4] font-semibold">
                    <ShieldCheck className="w-4 h-4" /> Independent adjudication
                  </div>
                  <p className="text-[12.5px] text-[#e8eaf0] leading-relaxed">{d.adjudication}</p>
                  <div className="font-mono text-[10px] text-[#3d4350]">
                    {d.resolved_at ? new Date(d.resolved_at).toLocaleTimeString('en-GB', { hour12: false }) : 'recent'}
                  </div>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
