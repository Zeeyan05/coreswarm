'use client';

import React, { useMemo, useState } from 'react';
import { ShieldCheck, ShieldX, Copy, Check, Loader2 } from 'lucide-react';
import { Did, SectionHead } from './primitives';
import { verifyEnvelopeSignature } from '../core/crypto/verify';
import type { CoreSwarmEnvelope } from '../core/types/protocol';

/**
 * Protocol debugger: real coreswarm/1 envelopes, real local Ed25519 checks.
 * Feels like a Web3 protocol debugger, not browser devtools.
 */

type VState = 'idle' | 'checking' | 'valid' | 'invalid';

export function ProtocolDebugger({ envelopes }: { envelopes: CoreSwarmEnvelope[] }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [copied, setCopied] = useState(false);
  const [vState, setVState] = useState<VState>('idle');
  const [vError, setVError] = useState<string | null>(null);

  const filtered = useMemo(
    () => envelopes.filter((e) => typeFilter === 'ALL' || e.message_type === typeFilter),
    [envelopes, typeFilter],
  );
  const sel = (selId ? envelopes.find((e) => e.message_id === selId) : undefined) ?? filtered[0] ?? null;
  const types = useMemo(() => [...new Set(envelopes.map((e) => e.message_type))], [envelopes]);

  const select = (id: string) => { setSelId(id); setVState('idle'); setVError(null); };

  const verify = async () => {
    if (!sel || vState === 'checking') return;
    setVState('checking'); setVError(null);
    try {
      const r = await verifyEnvelopeSignature(sel);
      setVState(r.valid ? 'valid' : 'invalid');
      setVError(r.valid ? null : (r.error ?? 'mismatch'));
    } catch (err) {
      setVState('invalid');
      setVError((err as Error)?.message ?? String(err));
    }
  };

  return (
    <div className="space-y-4">
      <SectionHead
        kicker="Protocol · envelope debugger"
        title="coreswarm/1 on the wire"
        right={
          <select
            value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="cs-focusable bg-[#0e1118] border border-[#1c212c] font-mono text-[12px] text-white rounded-lg px-3 py-2 focus:border-[#7dd3fc]/50 transition-colors"
          >
            <option value="ALL">All types ({envelopes.length})</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
        <div className="cs-panel p-3.5 space-y-2 max-h-[640px] overflow-y-auto cs-scroll">
          <div className="cs-label px-1">Packet stream ({filtered.length})</div>
          {filtered.length === 0 && (
            <div className="py-12 text-center font-mono text-[12px] text-[#3d4350]">No envelopes yet.</div>
          )}
          {filtered.map((env) => (
            <button
              key={env.message_id}
              onClick={() => select(env.message_id)}
              className={`cs-btn cs-focusable w-full text-left p-3 rounded-lg border ${
                sel?.message_id === env.message_id ? 'bg-[#131722] border-[#7dd3fc]/40' : 'bg-[#0e1118] border-[#1c212c] hover:border-[#343b4c]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-[11px] font-semibold text-[#7dd3fc]">{env.message_type}</span>
                <span className="font-mono text-[11px] text-[#3d4350] tabular-nums">{new Date(env.created_at).toLocaleTimeString('en-GB', { hour12: false })}</span>
              </div>
              <div className="font-mono text-[12px] text-white truncate">{env.sender.agent_id} → {env.recipient.agent_id}</div>
              <div className="font-mono text-[11px] text-[#3d4350]">nonce …{env.nonce.slice(-6)} · Ed25519</div>
            </button>
          ))}
        </div>

        <div className="cs-panel p-5 md:p-7" key={sel?.message_id ?? 'empty'}>
          {!sel ? (
            <div className="py-20 text-center font-mono text-[12px] text-[#3d4350]">Select a packet to inspect.</div>
          ) : (
            <div className="space-y-6 cs-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b cs-hairline pb-5">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[12px] font-semibold px-2.5 py-1 rounded-md border border-[#7dd3fc]/30 bg-[#7dd3fc]/5 text-[#7dd3fc]">{sel.message_type}</span>
                  <span className="font-mono text-[12px] text-[#3d4350]">{sel.message_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  {vState === 'valid' && (
                    <span className="flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-md border border-[#5eead4]/30 bg-[#5eead4]/5 text-[#5eead4] cs-scale-in">
                      <ShieldCheck className="w-3.5 h-3.5" />signature valid — checked locally
                    </span>
                  )}
                  {vState === 'invalid' && (
                    <span className="flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-md border border-[#fda4af]/30 bg-[#fda4af]/5 text-[#fda4af]" title={vError ?? undefined}>
                      <ShieldX className="w-3.5 h-3.5" />invalid{vError ? `: ${vError}` : ''}
                    </span>
                  )}
                  {vState !== 'valid' && (
                    <button
                      onClick={verify} disabled={vState === 'checking'}
                      className="cs-btn cs-focusable flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e1118] border border-[#7dd3fc]/30 text-[#7dd3fc] hover:bg-[#131722] font-mono text-[11px] disabled:opacity-50"
                    >
                      {vState === 'checking' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      {vState === 'checking' ? 'checking…' : 'verify signature'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-mono text-[12px]">
                {([
                  ['sender', sel.sender.agent_id, sel.sender.did],
                  ['recipient', sel.recipient.agent_id, sel.recipient.did],
                ] as const).map(([k, id, did]) => (
                  <div key={k} className="rounded-lg border border-[#1c212c] bg-[#0e1118] p-3">
                    <div className="cs-label mb-1.5">{k}</div>
                    <div className="text-white font-semibold">{id}</div>
                    <Did value={did} />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[12px] text-[#5d6474]">
                <span>protocol <strong className="text-white font-medium">{sel.protocol}</strong></span>
                <span className="break-all">nonce <strong className="text-white font-medium tabular-nums">{sel.nonce}</strong></span>
                <span>time <strong className="text-white font-medium tabular-nums">{new Date(sel.created_at).toLocaleTimeString('en-GB', { hour12: false })}</strong></span>
                <span>mission <strong className="text-white font-medium">{sel.mission_id}</strong></span>
              </div>

              <div>
                <div className="cs-label mb-1.5">Ed25519 signature ({sel.signature.length} chars)</div>
                <div className="font-mono text-[12px] leading-relaxed text-[#5eead4] rounded-lg border border-[#1c212c] bg-[#0e1118] p-3 break-all">{sel.signature}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="cs-label">Payload</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(sel.payload, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="cs-btn cs-focusable flex items-center gap-1.5 font-mono text-[12px] text-[#7dd3fc] hover:text-white"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-[#5eead4]" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'copied' : 'copy'}
                  </button>
                </div>
                <pre className="font-mono text-[12px] leading-relaxed cs-inset p-4 text-[#b8c0cf] overflow-x-auto max-h-[320px] cs-scroll">{JSON.stringify(sel.payload, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
