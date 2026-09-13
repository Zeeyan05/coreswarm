'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { LifecycleRail } from './primitives';

/** Scroll-to-top affordance for long views (evidence, protocol, replay). */
function ScrollTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Back to top"
      aria-label="Back to top"
      className="cs-btn cs-focusable cs-scale-in fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full border border-[#7dd3fc]/30 bg-[#0b0d12]/95 backdrop-blur flex items-center justify-center text-[#7dd3fc] hover:bg-[#131722] shadow-[0_8px_30px_-8px_rgba(0,0,0,0.8)]"
    >
      <ArrowUp className="w-4 h-4" />
    </button>
  );
}

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
      <div className="cs-grid-bg cs-grid-drift pointer-events-none fixed inset-0" />

      {/* Top command bar — sticky so nav + live status survive scrolling */}
      <header className="sticky top-0 z-30 border-b border-[#1c212c] bg-[#08090c]/92 backdrop-blur-md cs-fade-in shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between min-h-[64px] py-2 gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3 shrink-0">
              <img src="/logo.svg" alt="CoreSwarm" className="w-9 h-9 rounded-lg transition-transform duration-300 hover:scale-105 hover:rotate-3" />
              <div className="leading-none">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold tracking-[0.18em] text-[15px] text-white">CORESWARM</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#262c39] text-[#5d6474]">coreswarm/1</span>
                </div>
                <div className="font-mono text-[10px] tracking-[0.22em] text-[#5d6474] mt-1">
                  AUTONOMOUS COORDINATION NETWORK
                </div>
              </div>
            </div>

            {/* Lifecycle backbone */}
            <div className="hidden xl:block flex-1 max-w-[560px]">
              <LifecycleRail status={missionStatus} compact />
            </div>

            {/* Live status cluster */}
            <div className="flex items-center gap-2 shrink-0 font-mono text-[12px]">
              <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
                isRunning
                  ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/5 text-[#7dd3fc]'
                  : missionStatus === 'COMPLETED'
                    ? 'border-[#5eead4]/30 bg-[#5eead4]/5 text-[#5eead4]'
                    : 'border-[#262c39] bg-[#0e1118] text-[#8b93a5]'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${isRunning ? 'bg-[#7dd3fc] cs-breathe' : missionStatus === 'COMPLETED' ? 'bg-[#5eead4]' : 'bg-[#3d4350]'}`} />
                {isRunning ? 'LIVE' : missionStatus ?? 'STANDBY'}
              </span>
              <span className="hidden md:inline px-3 py-1.5 rounded-full border border-[#262c39] bg-[#0e1118] text-[#8b93a5] tabular-nums">
                T+{fmtElapsed(elapsedMs)}
              </span>
              {disputeCount > 0 && (
                <span className="hidden md:inline px-3 py-1.5 rounded-full border border-[#fcd34d]/30 bg-[#fcd34d]/5 text-[#fcd34d] cs-scale-in">
                  {disputeCount} dispute{disputeCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          {/* Nav strip */}
          <nav className="flex items-center gap-1 overflow-x-auto pb-2.5 -mb-px cs-scroll" aria-label="Views">
            {NAV.map((n) => {
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => onView(n.id)}
                  title={n.hint}
                  aria-current={active ? 'page' : undefined}
                  className={`cs-btn cs-focusable px-3.5 py-2 font-mono text-[12px] tracking-[0.06em] rounded-lg border whitespace-nowrap ${
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
              <span className="ml-auto hidden lg:inline font-mono text-[11px] text-[#3d4350] truncate pl-4" title={missionId}>
                {missionId}
              </span>
            )}
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-6 py-6">
        <div key={view} className="cs-fade-in">
          {children}
        </div>
      </main>

      <footer className="relative z-10 border-t border-[#1c212c] py-3.5">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 flex items-center justify-between font-mono text-[11px] text-[#3d4350]">
          <span>CORESWARM · verifiable multi-agent coordination over Technocore</span>
          <span className="hidden sm:inline">VERIFIED = grounded in cited extracts</span>
        </div>
      </footer>
      <ScrollTop />
    </div>
  );
}
