'use client';

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { StateTag, SectionHead, GroundedNote } from './primitives';
import { ProvenanceGraph } from '../core/provenance/provenance-graph';
import type { Claim } from '../core/types/claims';
import type { Evidence } from '../core/types/evidence';

/**
 * Evidence interface: SOURCE → EVIDENCE → CLAIM → RESULT → VERIFICATION → CONCLUSION.
 * Select a final claim, trace it backwards. Real graph state only.
 */

export function EvidenceTrace({ claims, evidenceGraph }: { claims: Record<string, Claim>; evidenceGraph: Record<string, Evidence> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');

  const claimList = useMemo(() => Object.values(claims), [claims]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claimList.filter((c) => {
      if (filter !== 'ALL' && c.verification_status !== filter) return false;
      if (!q) return true;
      return c.statement.toLowerCase().includes(q) || c.claim_id.toLowerCase().includes(q) || c.origin_agent.toLowerCase().includes(q);
    });
  }, [claimList, filter, query]);

  const selected = (selectedId ? claims[selectedId] : undefined) ?? filtered[0] ?? null;

  const prov = useMemo(() => {
    const g = new ProvenanceGraph();
    for (const c of claimList) g.recordClaim(c);
    for (const e of Object.values(evidenceGraph)) g.recordEvidence(e);
    return g;
  }, [claimList, evidenceGraph]);

  const steps = selected ? prov.traceBackward(selected.claim_id) : [];

  return (
    <div className="space-y-4">
      <SectionHead
        kicker="Evidence · backward provenance"
        title="Trace every conclusion to its source"
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#3d4350] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search claims…"
                className="bg-[#0e1118] border border-[#1c212c] font-mono text-[11px] text-white rounded-md pl-8 pr-2.5 py-1.5 w-48 focus:outline-none focus:border-[#7dd3fc]/50 placeholder:text-[#3d4350]"
              />
            </div>
            <select
              value={filter} onChange={(e) => setFilter(e.target.value)}
              className="bg-[#0e1118] border border-[#1c212c] font-mono text-[11px] text-white rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#7dd3fc]/50"
            >
              <option value="ALL">All ({claimList.length})</option>
              <option value="VERIFIED">Grounded</option>
              <option value="PARTIALLY_VERIFIED">Partial</option>
              <option value="CONTRADICTED">Contradicted</option>
              <option value="INSUFFICIENT_EVIDENCE">Insufficient</option>
              <option value="UNVERIFIED">Unverified</option>
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        {/* Claim rail */}
        <div className="cs-panel p-3 space-y-1.5 max-h-[640px] overflow-y-auto cs-scroll">
          <div className="cs-label px-1">Claims ({filtered.length})</div>
          {filtered.length === 0 && (
            <div className="py-8 text-center font-mono text-[11px] text-[#3d4350]">
              {claimList.length === 0 ? 'No claims yet. Run a mission.' : 'No matches.'}
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.claim_id}
              onClick={() => setSelectedId(c.claim_id)}
              className={`w-full text-left p-2.5 rounded-md border transition-all ${
                selected?.claim_id === c.claim_id ? 'bg-[#131722] border-[#7dd3fc]/40' : 'bg-[#0e1118] border-[#1c212c] hover:border-[#343b4c]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-[9px] text-[#3d4350]">{c.type}</span>
                <StateTag state={c.verification_status} />
              </div>
              <p className="text-[12px] text-white leading-snug line-clamp-2">{c.statement}</p>
              <div className="mt-1 font-mono text-[10px] text-[#5d6474]">{c.origin_agent} · {c.evidence_refs.length} refs</div>
            </button>
          ))}
        </div>

        {/* Backward chain */}
        <div className="cs-panel p-5 md:p-6">
          {!selected ? (
            <div className="py-16 text-center font-mono text-[11px] text-[#3d4350]">Select a claim to trace its provenance.</div>
          ) : (
            <div className="space-y-5">
              <div className="border-b cs-hairline pb-4">
                <div className="font-mono text-[10px] text-[#3d4350] mb-1">FINAL CONCLUSION · <span className="text-[#7dd3fc]">{selected.claim_id}</span></div>
                <h3 className="font-display text-[15px] font-semibold text-white leading-snug">{selected.statement}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[#5d6474]">
                  <span>origin <strong className="text-white font-medium">{selected.origin_agent}</strong></span>
                  <span>task <strong className="text-white font-medium">{selected.origin_task_id}</strong></span>
                  <span>confidence <strong className="text-[#7dd3fc]">{(selected.confidence * 100).toFixed(0)}%</strong></span>
                  <StateTag state={selected.verification_status} />
                </div>
                {selected.verification_reason && (
                  <p className="mt-2 font-mono text-[11px] text-[#8b93a5] rounded-md border border-[#1c212c] bg-[#0e1118] p-2.5">{selected.verification_reason}</p>
                )}
                <GroundedNote className="mt-2" />
              </div>

              <div className="relative ml-2 border-l border-[#262c39] pl-5 space-y-4">
                {steps.map((s, i) => {
                  const missing = s.level === 'MISSING_EVIDENCE';
                  const tone = missing ? '#fda4af' : s.level === 'VERIFICATION' ? '#a78bfa' : s.level === 'EVIDENCE' || s.level === 'SOURCE' ? '#7dd3fc' : '#8b93a5';
                  return (
                    <div key={i} className="relative cs-rise" style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}>
                      <span className="absolute -left-[26px] top-1 w-2.5 h-2.5 rounded-full bg-[#060709] border" style={{ borderColor: tone }} />
                      <div className={`rounded-md border p-3 ${missing ? 'border-[#fda4af]/30 bg-[#fda4af]/5' : 'border-[#1c212c] bg-[#0e1118]'}`}>
                        <div className="flex items-center justify-between gap-2 font-mono text-[10px] mb-1">
                          <span className="font-semibold tracking-[0.1em]" style={{ color: tone }}>{s.level.replace('_', ' ')}</span>
                          <span className="text-[#3d4350] truncate">{s.id}</span>
                        </div>
                        <p className="text-[12px] text-white leading-relaxed">{s.description}</p>
                        {s.level === 'EVIDENCE' && (
                          <div className="mt-2 space-y-1">
                            <div className="font-mono text-[10px] text-[#5d6474]">
                              {String(s.details['source'] ?? '')} · {String(s.details['locator'] ?? '')} · {String(s.details['collected_by'] ?? '')}
                            </div>
                            <pre className="font-mono text-[11px] cs-inset p-2.5 text-[#7dd3fc] whitespace-pre-wrap overflow-x-auto">{String(s.details['extract'] ?? '')}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
