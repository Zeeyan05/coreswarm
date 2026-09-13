'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { LifecycleRail } from './primitives';

export type ViewKey =
  | 'command' | 'evidence' | 'disputes' | 'verify'
  | 'replay' | 'protocol' | 'agents';

const NAV: Array<{ id: ViewKey; label: string; hint: string }> = [
  { id: 'command', label: 'Command', hint: 'Mission control' },
  { id: 'evidence', label: 'Evidence', hint: 'Provenance traces' },
  { id: 'disputes', label: 'Disputes', hint: 'Resolution arena' },
  { id: 'verify', label: 'Verify', hint: 'Verification ledger' },
  { id: 'replay', label: 'Replay', hint: 'Event time-travel' },
  { id: 'protocol', label: 'Protocol', hint: 'Envelope debugger' },
  { id: 'agents', label: 'Agents', hint: 'Network registry' },
];

interface MissionShellProps {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  missionId?: string;
  missionStatus?: string;
  isRunning: boolean;
  elapsedMs: number;
  disputeCount: number;
  children: React.ReactNode;
}

function fmtElapsed(ms: number): string {
  if (!ms) return '00:00';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function MissionShell({
  view, onView, missionId, missionStatus, isRunning, elapsedMs, disputeCount, children,
}: MissionShellProps) {
  return (
    <div className="min-h-screen bg-[#060709] text-[#e8eaf0] flex flex-col relative">
      <div className="cs-grid-bg pointer-events-none fixed inset-0" />

      {/* Top command bar */}
      <header className="relative z-20 border-b border-[#1c212c] bg-[#08090c]/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-[60px] gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-md bg-[#0e1118] border border-[#7dd3fc]/30 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-[#7dd3fc]" />
              </div>
              <div className="leading-none">
                <div className="flex items-center gap-2">
                  <span className="font-display font-700 font-bold tracking-[0.18em] text-[15px] text-white">CORESWARM</span>
                  <span className="font-mono text-[9px] px-1 py-px rounded border border-[#262c39] text-[#5d6474]">coreswarm/1</span>
                </div>
                <div className="font-mono text-[9px] tracking-[0.22em] text-[#5d6474] mt-1">
                  AUTONOMOUS COORDINATION NETWORK
                </div>
              </div>
            </div>

            {/* Lifecycle backbone */}
            <div className="hidden xl:block flex-1 max-w-[560px]">
              <LifecycleRail status={missionStatus} compact />
            </div>

            {/* Live status cluster */}
            <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                isRunning
                  ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/5 text-[#7dd3fc]'
                  : missionStatus === 'COMPLETED'
                    ? 'border-[#5eead4]/30 bg-[#5eead4]/5 text-[#5eead4]'
                    : 'border-[#262c39] bg-[#0e1118] text-[#8b93a5]'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[#7dd3fc] cs-breathe' : missionStatus === 'COMPLETED' ? 'bg-[#5eead4]' : 'bg-[#3d4350]'}`} />
                {isRunning ? 'LIVE' : missionStatus ?? 'STANDBY'}
              </span>
              <span className="hidden md:inline px-2.5 py-1 rounded-full border border-[#262c39] bg-[#0e1118] text-[#8b93a5] tabular-nums">
                T+{fmtElapsed(elapsedMs)}
              </span>
              {disputeCount > 0 && (
                <span className="hidden md:inline px-2.5 py-1 rounded-full border border-[#fcd34d]/30 bg-[#fcd34d]/5 text-[#fcd34d]">
                  {disputeCount} dispute{disputeCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          {/* Nav strip */}
          <nav className="flex items-center gap-1 overflow-x-auto pb-2 -mb-px">
            {NAV.map((n) => {
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => onView(n.id)}
                  title={n.hint}
                  className={`px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] rounded-md border transition-all whitespace-nowrap ${
                    active
                      ? 'text-[#7dd3fc] border-[#7dd3fc]/30 bg-[#7dd3fc]/5'
                      : 'text-[#5d6474] border-transparent hover:text-[#b8c0cf] hover:bg-[#0e1118]'
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
            {missionId && (
              <span className="ml-auto hidden lg:inline font-mono text-[10px] text-[#3d4350] truncate pl-4">
                {missionId}
              </span>
            )}
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-6 py-5">
        {children}
      </main>

      <footer className="relative z-10 border-t border-[#1c212c] py-3">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 flex items-center justify-between font-mono text-[10px] text-[#3d4350]">
          <span>CORESWARM · verifiable multi-agent coordination over Technocore</span>
          <span className="hidden sm:inline">VERIFIED = grounded in cited extracts</span>
        </div>
      </footer>
    </div>
  );
}
