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
            className="bg-[#0e1118] border border-[#1c212c] font-mono text-[11px] text-white rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#7dd3fc]/50"
          >
            <option value="ALL">All types ({envelopes.length})</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <div className="cs-panel p-3 space-y-1.5 max-h-[640px] overflow-y-auto cs-scroll">
          <div className="cs-label px-1">Packet stream ({filtered.length})</div>
          {filtered.length === 0 && (
            <div className="py-10 text-center font-mono text-[11px] text-[#3d4350]">No envelopes yet.</div>
          )}
          {filtered.map((env) => (
            <button
              key={env.message_id}
              onClick={() => select(env.message_id)}
              className={`w-full text-left p-2.5 rounded-md border transition-all ${
                sel?.message_id === env.message_id ? 'bg-[#131722] border-[#7dd3fc]/40' : 'bg-[#0e1118] border-[#1c212c] hover:border-[#343b4c]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-[10px] font-semibold text-[#7dd3fc]">{env.message_type}</span>
                <span className="font-mono text-[10px] text-[#3d4350]">{new Date(env.created_at).toLocaleTimeString('en-GB', { hour12: false })}</span>
              </div>
              <div className="font-mono text-[11px] text-white truncate">{env.sender.agent_id} → {env.recipient.agent_id}</div>
              <div className="font-mono text-[10px] text-[#3d4350]">nonce …{env.nonce.slice(-6)} · Ed25519</div>
            </button>
          ))}
        </div>

        <div className="cs-panel p-5 md:p-6">
          {!sel ? (
            <div className="py-16 text-center font-mono text-[11px] text-[#3d4350]">Select a packet to inspect.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b cs-hairline pb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded border border-[#7dd3fc]/30 bg-[#7dd3fc]/5 text-[#7dd3fc]">{sel.message_type}</span>
                  <span className="font-mono text-[11px] text-[#3d4350]">{sel.message_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  {vState === 'valid' && (
                    <span className="flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded border border-[#5eead4]/30 bg-[#5eead4]/5 text-[#5eead4]">
                      <ShieldCheck className="w-3 h-3" />signature valid — checked locally
                    </span>
                  )}
                  {vState === 'invalid' && (
                    <span className="flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded border border-[#fda4af]/30 bg-[#fda4af]/5 text-[#fda4af]" title={vError ?? undefined}>
                      <ShieldX className="w-3 h-3" />invalid{vError ? `: ${vError}` : ''}
                    </span>
                  )}
                  {vState !== 'valid' && (
                    <button
                      onClick={verify} disabled={vState === 'checking'}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1118] border border-[#7dd3fc]/30 text-[#7dd3fc] hover:bg-[#131722] font-mono text-[10px] disabled:opacity-50"
                    >
                      {vState === 'checking' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                      {vState === 'checking' ? 'checking…' : 'verify signature'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                {([
                  ['sender', sel.sender.agent_id, sel.sender.did],
                  ['recipient', sel.recipient.agent_id, sel.recipient.did],
                ] as const).map(([k, id, did]) => (
                  <div key={k} className="rounded-md border border-[#1c212c] bg-[#0e1118] p-2.5">
                    <div className="cs-label mb-1">{k}</div>
                    <div className="text-white font-semibold">{id}</div>
                    <Did value={did} className="text-[10px]" />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-[#5d6474]">
                <span>protocol <strong className="text-white">{sel.protocol}</strong></span>
                <span className="break-all">nonce <strong className="text-white">{sel.nonce}</strong></span>
                <span>time <strong className="text-white">{new Date(sel.created_at).toLocaleTimeString('en-GB', { hour12: false })}</strong></span>
                <span>mission <strong className="text-white">{sel.mission_id}</strong></span>
              </div>

              <div>
                <div className="cs-label mb-1">Ed25519 signature ({sel.signature.length} chars)</div>
                <div className="font-mono text-[11px] text-[#5eead4] rounded-md border border-[#1c212c] bg-[#0e1118] p-2.5 break-all">{sel.signature}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="cs-label">Payload</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(sel.payload, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="flex items-center gap-1 font-mono text-[11px] text-[#7dd3fc] hover:text-white"
                  >
                    {copied ? <Check className="w-3 h-3 text-[#5eead4]" /> : <Copy className="w-3 h-3" />}{copied ? 'copied' : 'copy'}
                  </button>
                </div>
                <pre className="font-mono text-[11px] cs-inset p-4 text-[#b8c0cf] overflow-x-auto max-h-[320px] cs-scroll">{JSON.stringify(sel.payload, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
