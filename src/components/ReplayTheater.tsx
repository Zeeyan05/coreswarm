'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { SectionHead } from './primitives';
import { MissionReplayEngine } from '../core/replay/mission-replay';
import type { CoreSwarmEvent } from '../core/types/events';

/**
 * Replay theater: inspect the autonomous system after execution.
 * Event-sourced time-travel — states rebuild from the immutable log,
 * never from simulation.
 */

const SPEEDS = [1, 2, 4] as const;

export function ReplayTheater({ events }: { events: readonly CoreSwarmEvent[] }) {
  const [idx, setIdx] = useState(events.length > 0 ? events.length - 1 : -1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const engine = useMemo(() => new MissionReplayEngine(events), [events]);
  const state = useMemo(() => engine.replayTo(idx), [engine, idx]);

  useEffect(() => { setIdx(events.length > 0 ? events.length - 1 : -1); setPlaying(false); }, [events.length]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setIdx((p) => {
        if (p >= events.length - 1) { setPlaying(false); return p; }
        return p + 1;
      });
    }, Math.max(150, 1000 / speed));
    return () => clearInterval(t);
  }, [playing, events.length, speed]);

  const seek = (n: number) => { setPlaying(false); setIdx(Math.max(-1, Math.min(events.length - 1, n))); };

  return (
    <div className="space-y-4">
      <SectionHead kicker="Replay · event time-travel" title="Inspect the system after execution" />

      {events.length === 0 ? (
        <div className="cs-panel p-14 text-center font-mono text-[12px] text-[#3d4350] cs-fade-in">
          No events recorded. Run a mission to generate history.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Transport bar */}
          <div className="cs-panel px-5 py-4">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="flex items-center gap-2">
                <button onClick={() => seek(0)} disabled={idx <= 0} title="Jump to start"
                  className="cs-btn cs-focusable p-2.5 rounded-lg bg-[#0e1118] border border-[#1c212c] text-[#8b93a5] hover:text-white disabled:opacity-30">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={() => setPlaying(!playing)}
                  className="cs-btn cs-btn-primary cs-focusable px-5 py-2.5 rounded-lg bg-[#7dd3fc] text-[#060709] font-mono text-[12px] font-bold hover:bg-[#a5e3ff] flex items-center gap-1.5">
                  {playing ? <><Pause className="w-3.5 h-3.5 fill-current" />PAUSE</> : <><Play className="w-3.5 h-3.5 fill-current" />PLAY</>}
                </button>
                <button onClick={() => seek(events.length - 1)} disabled={idx >= events.length - 1} title="Jump to end"
                  className="cs-btn cs-focusable p-2.5 rounded-lg bg-[#0e1118] border border-[#1c212c] text-[#8b93a5] hover:text-white disabled:opacity-30">
                  <SkipForward className="w-4 h-4" />
                </button>
                <button onClick={() => seek(-1)} disabled={idx < 0} title="Reset to initial"
                  className="cs-btn cs-focusable p-2.5 rounded-lg bg-[#0e1118] border border-[#1c212c] text-[#8b93a5] hover:text-white disabled:opacity-30">
                  <RotateCcw className="w-4 h-4" />
                </button>
                <div className="flex items-center rounded-lg border border-[#1c212c] bg-[#0e1118] overflow-hidden font-mono text-[11px]">
                  {SPEEDS.map((s) => (
                    <button key={s} onClick={() => setSpeed(s)}
                      className={`cs-focusable px-2.5 py-2 transition-colors ${speed === s ? 'bg-[#7dd3fc]/10 text-[#7dd3fc] font-bold' : 'text-[#5d6474] hover:text-white'}`}>{s}x</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[160px] flex items-center gap-3">
                <span className="font-mono text-[12px] text-[#5d6474] tabular-nums whitespace-nowrap">{idx + 1} / {events.length}</span>
                <input type="range" min={-1} max={events.length - 1} value={idx} onChange={(e) => seek(parseInt(e.target.value, 10))} className="cs-range w-full" aria-label="Replay position" />
              </div>
              <span className="font-mono text-[12px] font-semibold text-[#7dd3fc] whitespace-nowrap tabular-nums">PHASE · {state.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="cs-panel p-5 md:p-6">
              <div className="cs-label mb-4">Recorded event</div>
              {state.current_event ? (
                <div className="space-y-3.5 font-mono text-[12px]" key={state.current_event.event_id}>
                  <div className="flex items-center justify-between gap-2 cs-fade-in">
                    <span className="text-[#a78bfa] font-bold text-[13px]">{state.current_event.event_type}</span>
                    <span className="text-[#3d4350] tabular-nums">{new Date(state.current_event.timestamp).toLocaleTimeString('en-GB', { hour12: false })}</span>
                  </div>
                  <div className="text-[#5d6474]">
                    actor <span className="text-white">{state.current_event.actor_id}</span>
                    {state.current_event.task_id && <> · task <span className="text-white">{state.current_event.task_id}</span></>}
                  </div>
                  <pre className="text-[12px] leading-relaxed cs-inset p-3.5 text-[#b8c0cf] overflow-x-auto max-h-[240px] cs-scroll">
                    {JSON.stringify(state.current_event.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="py-12 text-center font-mono text-[12px] text-[#3d4350]">Initial state — scrub forward.</div>
              )}
            </div>

            <div className="cs-panel p-5 md:p-6">
              <div className="cs-label mb-4">Reconstructed state</div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto cs-scroll">
                {Object.values(state.tasks).length === 0 && (
                  <div className="py-10 text-center font-mono text-[12px] text-[#3d4350]">No tasks at this point in history.</div>
                )}
                {Object.values(state.tasks).map((t) => (
                  <div key={t.task_id} className="flex items-center justify-between gap-2.5 rounded-lg bg-[#0e1118] border border-[#1c212c] px-3 py-2.5 font-mono text-[12px]">
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{t.title}</div>
                      <div className="text-[11px] text-[#3d4350]">{t.assigned_agent || 'unassigned'}</div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md border border-[#1c212c] text-[#7dd3fc] shrink-0">{t.status}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 pt-3 border-t cs-hairline flex justify-between font-mono text-[12px] text-[#5d6474] tabular-nums">
                <span>{Object.keys(state.claims).length} claims</span>
                <span>{Object.keys(state.disputes).length} disputes</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
