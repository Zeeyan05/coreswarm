'use client';

import React, { useMemo } from 'react';
import { SectionHead } from './primitives';
import type { SystemMetrics } from '../core/orchestrator/metrics';

/**
 * Telemetry: measured runtime values only. Zero fabricated numbers.
 * Dense technical readouts, not marketing charts.
 */

export function Telemetry({ metrics }: { metrics: SystemMetrics }) {
  const maxDur = useMemo(() => Math.max(1, ...Object.values(metrics.taskDurations)), [metrics.taskDurations]);
  const agentRows = useMemo(() => {
    const rows: Array<{ agent: string; runs: number; avg: number; max: number }> = [];
    for (const [agent, ls] of Object.entries(metrics.agentLatencies)) {
      if (ls.length === 0) continue;
      rows.push({ agent, runs: ls.length, avg: Math.round(ls.reduce((a, b) => a + b, 0) / ls.length), max: Math.max(...ls) });
    }
    return rows.sort((a, b) => b.avg - a.avg);
  }, [metrics.agentLatencies]);

  const outcomes = metrics.verificationOutcomes;
  const total = outcomes.verified + outcomes.partiallyVerified + outcomes.contradicted + outcomes.insufficientEvidence;

  return (
    <div className="space-y-4">
      <SectionHead kicker="Telemetry · measured runtime" title="What actually happened" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['duration', metrics.missionDurationMs ? `${(metrics.missionDurationMs / 1000).toFixed(2)}s` : '—', 'performance.now()'],
          ['packets', `${metrics.messageCount}`, 'coreswarm/1 envelopes'],
          ['disputes', `${metrics.disputeCount}`, 'evidence adjudications'],
          ['fail / t-o / retry', `${metrics.taskFailures} / ${metrics.timeouts} / ${metrics.retries}`, 'recovery coverage'],
        ] as const).map(([k, v, s]) => (
          <div key={k} className="cs-panel p-4">
            <div className="cs-label mb-1">{k}</div>
            <div className="font-mono text-[22px] font-semibold text-white tabular-nums">{v}</div>
            <div className="font-mono text-[10px] text-[#3d4350]">{s}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="cs-panel p-5">
          <div className="cs-label mb-3">Task latency · ms</div>
          <div className="space-y-2.5 font-mono text-[11px]">
            {Object.keys(metrics.taskDurations).length === 0 && (
              <div className="py-6 text-center text-[#3d4350]">No task telemetry.</div>
            )}
            {Object.entries(metrics.taskDurations).map(([id, d]) => (
              <div key={id} className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b93a5] truncate">{id}</span>
                  <span className="text-white font-semibold tabular-nums shrink-0">{d} ms</span>
                </div>
                <div className="h-1 rounded-full bg-[#131722] overflow-hidden">
                  <div className="h-full rounded-full bg-[#7dd3fc]/80" style={{ width: `${Math.min(100, Math.max(4, (d / maxDur) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="cs-panel p-5">
          <div className="cs-label mb-3">Grounding distribution</div>
          <div className="space-y-2 font-mono text-[11px]">
            {([
              ['GROUNDED', outcomes.verified, 'text-[#5eead4]', 'bg-[#5eead4]/80'],
              ['PARTIAL', outcomes.partiallyVerified, 'text-[#7dd3fc]', 'bg-[#7dd3fc]/80'],
              ['CONTRADICTED', outcomes.contradicted, 'text-[#fda4af]', 'bg-[#fda4af]/80'],
              ['INSUFFICIENT', outcomes.insufficientEvidence, 'text-[#fcd34d]', 'bg-[#fcd34d]/80'],
            ] as const).map(([l, n, tc, bc]) => (
              <div key={l} className="rounded-md bg-[#0e1118] border border-[#1c212c] p-2.5 space-y-1.5">
                <div className="flex justify-between"><span className={`${tc} font-semibold`}>{l}</span><span className="text-white font-semibold tabular-nums">{n}</span></div>
                <div className="h-1 rounded-full bg-[#060709] overflow-hidden">
                  <div className={`h-full rounded-full ${bc}`} style={{ width: total > 0 ? `${Math.max(2, (n / total) * 100)}%` : '0%' }} />
                </div>
              </div>
            ))}
            {total === 0 && <p className="text-center text-[#3d4350] text-[11px]">No grounding decisions yet.</p>}
          </div>
        </div>
      </div>

      <div className="cs-panel p-5">
        <div className="cs-label mb-3">Per-agent latency</div>
        {agentRows.length === 0 ? (
          <div className="py-4 text-center font-mono text-[11px] text-[#3d4350]">No agent telemetry.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {agentRows.map((r) => (
              <div key={r.agent} className="rounded-md bg-[#0e1118] border border-[#1c212c] p-3 font-mono text-[11px]">
                <div className="text-white font-semibold truncate">{r.agent}</div>
                <div className="mt-1 flex justify-between text-[#5d6474]">
                  <span>{r.runs} run{r.runs === 1 ? '' : 's'}</span>
                  <span>avg <strong className="text-[#7dd3fc] tabular-nums">{r.avg}ms</strong></span>
                  <span>max <strong className="text-white tabular-nums">{r.max}ms</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
