'use client';

import React, { useMemo, useState } from 'react';
import { StateTag, SectionHead, GroundedNote } from './primitives';
import type { Claim } from '../core/types/claims';
import type { Evidence } from '../core/types/evidence';

/**
 * Verification ledger: visually distinct from execution.
 * Every claim with its grounding state, evidence refs resolved against the
 * REAL graph — dangling refs shown as missing, never hidden.
 */

export function VerifyLedger({ claims, evidenceGraph }: { claims: Record<string, Claim>; evidenceGraph: Record<string, Evidence> }) {
  const [filter, setFilter] = useState('ALL');
  const list = useMemo(() => Object.values(claims), [claims]);
  const filtered = list.filter((c) => filter === 'ALL' || c.verification_status === filter);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cl of list) c[cl.verification_status] = (c[cl.verification_status] ?? 0) + 1;
    return c;
  }, [list]);

  return (
    <div className="space-y-4">
      <SectionHead
        kicker="Verification · grounding ledger"
        title="What the network stands behind"
        right={
          <select
            value={filter} onChange={(e) => setFilter(e.target.value)}
            className="bg-[#0e1118] border border-[#1c212c] font-mono text-[11px] text-white rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#a78bfa]/50"
          >
            <option value="ALL">All states ({list.length})</option>
            <option value="VERIFIED">Grounded</option>
            <option value="PARTIALLY_VERIFIED">Partial</option>
            <option value="CONTRADICTED">Contradicted</option>
            <option value="INSUFFICIENT_EVIDENCE">Insufficient</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
        }
      />
      <GroundedNote />

      {/* Distribution rail */}
      {list.length > 0 && (
        <div className="cs-panel px-4 py-3 flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px]">
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className="flex items-center gap-1.5">
              <StateTag state={s} />
              <span className="text-white font-semibold tabular-nums">×{n}</span>
            </span>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="cs-panel p-12 text-center font-mono text-[11px] text-[#3d4350]">
          {list.length === 0 ? 'No claims yet. Verification begins after execution.' : 'No claims in this state.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => {
            const resolved = c.evidence_refs.map((id) => evidenceGraph[id]);
            const missing = c.evidence_refs.filter((id) => !evidenceGraph[id]);
            return (
              <div key={c.claim_id} className="cs-panel p-4 cs-rise">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-[#3d4350] mb-0.5">
                      {c.claim_id} · {c.type} · {c.origin_agent} · {(c.confidence * 100).toFixed(0)}% self-assessed
                    </div>
                    <p className="text-[13px] text-white leading-snug">{c.statement}</p>
                  </div>
                  <StateTag state={c.verification_status} />
                </div>
                {c.verification_reason && (
                  <p className="mt-2 font-mono text-[11px] text-[#8b93a5] rounded-md border border-[#1c212c] bg-[#0e1118] p-2.5">
                    {c.verified_by ? `${c.verified_by}: ` : ''}{c.verification_reason}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
                  {resolved.map((ev, i) =>
                    ev ? (
                      <span key={ev.evidence_id} title={`${ev.source} ${ev.locator}`} className="px-1.5 py-0.5 rounded border border-[#7dd3fc]/25 bg-[#7dd3fc]/5 text-[#7dd3fc]">
                        {ev.evidence_id}
                      </span>
                    ) : (
                      <span key={`${c.claim_id}-m-${i}`} className="px-1.5 py-0.5 rounded border border-[#fda4af]/30 bg-[#fda4af]/5 text-[#fda4af]">
                        {c.evidence_refs[i]} · missing
                      </span>
                    ),
                  )}
                  {missing.length > 0 && (
                    <span className="text-[#fda4af]">{missing.length} dangling ref{missing.length === 1 ? '' : 's'}</span>
                  )}
                  {c.evidence_refs.length === 0 && <span className="text-[#3d4350]">no evidence cited</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
