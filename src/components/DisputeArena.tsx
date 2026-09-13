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
        <div className="cs-panel p-14 text-center space-y-3 cs-fade-in">
          <Scale className="w-8 h-8 text-[#3d4350] mx-auto" strokeWidth={1.5} />
          <h3 className="cs-display-sm text-white">No disputes recorded</h3>
          <p className="font-mono text-[12px] text-[#5d6474] max-w-md mx-auto leading-relaxed">
            Claims align, or no mission has run. Enable the Dispute chaos scenario to watch live adjudication.
          </p>
        </div>
      ) : (
        list.map((d) => {
          const a = claims[d.claim_id];
          const b = d.counter_claim_id ? claims[d.counter_claim_id] : undefined;
          const stageIdx = d.status === 'RESOLVED' ? 4 : d.status === 'EVIDENCE_REQUESTED' ? 2 : 1;
          return (
            <article key={d.dispute_id} className="cs-panel cs-panel-interactive p-5 md:p-7 space-y-6 cs-scale-in">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b cs-hairline pb-5">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[12px] font-semibold px-2.5 py-1 rounded-md border border-[#fcd34d]/30 bg-[#fcd34d]/5 text-[#fcd34d]">{d.dispute_id}</span>
                  <StateTag state={d.status} />
                </div>
                {d.outcome && (
                  <div className="flex items-center gap-2 font-mono text-[12px]">
                    <span className="text-[#5d6474]">resolution</span>
                    <span className="px-2.5 py-1 rounded-md border border-[#5eead4]/30 bg-[#5eead4]/5 text-[#5eead4] font-semibold">{d.outcome}</span>
                  </div>
                )}
              </div>

              {/* Flow rail */}
              <div className="flex items-center gap-0" aria-label="Dispute progress">
                {FLOW.map((s, i) => (
                  <React.Fragment key={s}>
                    <span className={`font-mono text-[11px] tracking-[0.1em] transition-colors duration-300 ${i < stageIdx ? 'text-[#5eead4]' : i === stageIdx ? 'text-[#fcd34d] cs-breathe' : 'text-[#3d4350]'}`}>{s}</span>
                    {i < FLOW.length - 1 && <span className={`mx-2.5 h-px flex-1 transition-colors duration-500 ${i < stageIdx ? 'bg-[#5eead4]/30' : 'bg-[#1c212c]'}`} />}
                  </React.Fragment>
                ))}
              </div>

              {/* Reason */}
              <div className="rounded-lg border border-[#fcd34d]/20 bg-[#fcd34d]/5 p-4">
                <div className="cs-label !text-[#fcd34d] mb-1.5">Conflict detected</div>
                <p className="cs-body text-white">{d.reason}</p>
              </div>

              {/* Side by side */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                <div className="rounded-lg border border-[#1c212c] bg-[#0e1118] p-5 space-y-3">
                  <div className="flex items-center justify-between font-mono text-[12px]">
                    <span className="text-[#7dd3fc] font-semibold">{d.claimant_agent}</span>
                    <span className="text-[#3d4350]">{a?.type ?? '—'}</span>
                  </div>
                  <p className="cs-body text-white cs-inset p-3.5">
                    &ldquo;{a?.statement ?? 'Claim record unavailable.'}&rdquo;
                  </p>
                  <div className="font-mono text-[11px] text-[#5d6474]">
                    {a ? `${(a.confidence * 100).toFixed(0)}% self-assessed · ${a.verification_status} · ${a.evidence_refs.length} refs` : '—'}
                  </div>
                </div>
                <div className="flex md:flex-col items-center justify-center gap-1 font-display font-bold text-[#fcd34d] text-xl px-2">VS</div>
                <div className="rounded-lg border border-[#1c212c] bg-[#0e1118] p-5 space-y-3">
                  <div className="flex items-center justify-between font-mono text-[12px]">
                    <span className="text-[#fda4af] font-semibold">{d.challenger_agent}</span>
                    <span className="text-[#3d4350]">{b?.type ?? '—'}</span>
                  </div>
                  <p className="cs-body text-white cs-inset p-3.5">
                    &ldquo;{b?.statement ?? 'Counter-claim record unavailable.'}&rdquo;
                  </p>
                  <div className="font-mono text-[11px] text-[#5d6474]">
                    {b ? `${(b.confidence * 100).toFixed(0)}% self-assessed · ${b.verification_status} · ${b.evidence_refs.length} refs` : '—'}
                  </div>
                </div>
              </div>

              {/* Counter evidence */}
              {d.counter_evidence.length > 0 && (
                <div className="space-y-2">
                  <div className="cs-label">Counter evidence ({d.counter_evidence.length})</div>
                  {d.counter_evidence.slice(0, 3).map((ev) => (
                    <div key={ev.evidence_id} className="font-mono text-[12px] leading-relaxed cs-inset p-3 text-[#8b93a5]">
                      <span className="text-[#3d4350]">{ev.source} {ev.locator} — </span>
                      <span className="text-[#7dd3fc]">{ev.extract.slice(0, 160)}{ev.extract.length > 160 ? '…' : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Adjudication */}
              {d.adjudication && (
                <div className="rounded-lg border border-[#1c212c] border-l-2 border-l-[#5eead4] bg-[#0e1118] p-5 space-y-2">
                  <div className="flex items-center gap-2 font-mono text-[12px] text-[#5eead4] font-semibold">
                    <ShieldCheck className="w-4 h-4" /> Independent adjudication
                  </div>
                  <p className="cs-body text-[#e8eaf0]">{d.adjudication}</p>
                  <div className="font-mono text-[11px] text-[#3d4350]">
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
