'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Play, X, ChevronRight, ChevronLeft, RotateCcw, Sparkles } from 'lucide-react';
import type { ViewKey } from './MissionShell';

/**
 * Guided tour: automates the stranger-to-confident walkthrough.
 * 10 steps, plain words, drives the real app (nav + launch + reset).
 * Tour never fabricates state — it navigates views and narrates what's live.
 */

export interface TourContext {
  view: ViewKey;
  missionExists: boolean;
  missionCompleted: boolean;
  isRunning: boolean;
  disputeCount: number;
  claimCount: number;
  eventCount: number;
}

interface Step {
  id: string;
  title: string;
  body: string;
  view: ViewKey | null; // null = stay where you are
  cta?: string;
  action?: 'launch' | 'reset';
  waitFor?: (ctx: TourContext) => boolean;
  waitLabel?: string;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Meet the robot team',
    body: 'This app runs 4 robot helpers that check work for each other. You give a job, they split it, show proof, argue about disagreements, and deliver one answer you can trust. This tour walks you through it in about 3 minutes.',
    view: 'command',
    cta: 'Start the tour',
  },
  {
    id: 'empty',
    title: 'The honest empty room',
    body: 'With no mission running, the app shows nothing instead of faking activity. Top bar says STANDBY. Remember this "before" picture — everything you are about to see appears because real work happens.',
    view: 'command',
  },
  {
    id: 'launch',
    title: 'Launch the mission',
    body: 'Press LAUNCH below (or the tour button). The bar flips to LIVE, a network map fills in, jobs appear on the left, and a receipt-printer feed scrolls on the right. The whole run takes under a minute.',
    view: 'command',
    cta: 'Launch for me',
    action: 'launch',
    waitFor: (c) => c.missionCompleted,
    waitLabel: 'Running… the tour continues when the mission completes.',
  },
  {
    id: 'panels',
    title: 'Three panels, one story',
    body: 'Left: the 4 jobs and who does each. Middle: dots lighting up as helpers talk — watch for flying TASK_REQUEST labels. Right: every action timestamped. Nothing happens secretly.',
    view: 'command',
  },
  {
    id: 'report',
    title: 'The final report',
    body: 'Scroll down to the report card: a summary, risks found, and recommendations. The badges (grounded / disputes) count proven claims. The links jump to proof, arguments, and replay.',
    view: 'command',
  },
  {
    id: 'evidence',
    title: 'Trace any answer to its proof',
    body: 'Click any claim on the left. The right side walks backwards: conclusion → claim → check → evidence → source file. Missing links show MISSING in red instead of hiding.',
    view: 'evidence',
    waitFor: (c) => c.claimCount > 0,
    waitLabel: 'Waiting for claims…',
  },
  {
    id: 'disputes',
    title: 'Arguments, settled in public',
    body: 'Two helpers disagreed — one said signatures are strictly checked, the other said some paths skip it. Below: the extra proof demanded, and the Judge naming the winner. Disagreement is a feature here.',
    view: 'disputes',
  },
  {
    id: 'replay',
    title: 'Rewind time',
    body: 'Press PLAY. The timeline rebuilds the whole mission from its saved log — drag the slider and the task list matches that exact moment. Nothing re-runs; it is all history.',
    view: 'replay',
    waitFor: (c) => c.eventCount > 5,
    waitLabel: 'Waiting for events…',
  },
  {
    id: 'protocol',
    title: 'Check the math yourself',
    body: 'These are the sealed envelopes helpers sent. Click one, then "verify signature" — the math is checked in your browser. Same cryptography protecting the whole system.',
    view: 'protocol',
  },
  {
    id: 'agents',
    title: 'Meet the team + break things',
    body: 'Four cards: Reader, Detective, Judge, Writer — with unforgeable IDs and real job lists. Done touring? Go to Command, Reset, flip on the Dispute or Timeout switches, and watch the system survive unhappy paths. That is the whole point.',
    view: 'agents',
    cta: 'Back to Command',
  },
];

interface GuidedTourProps {
  ctx: TourContext;
  onNavigate: (v: ViewKey) => void;
  onLaunch: () => void;
  onReset: () => void;
}

export function GuidedTour({ ctx, onNavigate, onLaunch, onReset }: GuidedTourProps) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [launched, setLaunched] = useState(false);
  const step = STEPS[idx]!;

  const close = useCallback(() => {
    setOpen(false);
    setIdx(0);
    setLaunched(false);
  }, []);

  // Drive navigation when the step changes
  useEffect(() => {
    if (!open) return;
    if (step.view) onNavigate(step.view);
  }, [open, idx, onNavigate, step.view]);

  // Reset the launch CTA whenever we leave the launch step
  useEffect(() => {
    if (!open) return;
    if (step.id !== 'launch') setLaunched(false);
  }, [open, step.id, idx]);

  const waiting = step.waitFor ? !step.waitFor(ctx) : false;

  const next = () => {
    if (idx >= STEPS.length - 1) {
      close();
      onNavigate('command');
      return;
    }
    setIdx(idx + 1);
  };

  const fireAction = () => {
    if (step.action === 'launch') {
      setLaunched(true);
      onLaunch();
    }
    if (step.action === 'reset') onReset();
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setIdx(0); setLaunched(false); }}
        title="Automated walkthrough: stranger to confident in ~3 minutes"
        className="cs-btn cs-focusable flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-[12px] text-[#a78bfa] border border-[#a78bfa]/30 bg-[#a78bfa]/5 hover:bg-[#a78bfa]/10"
      >
        <Sparkles className="w-3.5 h-3.5" />Take the tour
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(560px,calc(100vw-2rem))]">
      <div className="cs-panel-raised p-5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] cs-scale-in border-[#a78bfa]/25">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[11px] tracking-[0.14em] text-[#a78bfa] uppercase mb-1">
              Guided tour · {idx + 1} of {STEPS.length}
            </div>
            <h3 className="cs-display-sm text-white">{step.title}</h3>
          </div>
          <button onClick={close} title="End tour" aria-label="End tour"
            className="cs-btn cs-focusable p-1.5 rounded-md text-[#5d6474] hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-2 cs-body text-[#b8c0cf]">{step.body}</p>

        {/* Progress dots */}
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1 rounded-full transition-all duration-300 ${i === idx ? 'w-6 bg-[#a78bfa]' : i < idx ? 'w-3 bg-[#5eead4]/60' : 'w-3 bg-[#262c39]'}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
            className="cs-btn cs-focusable flex items-center gap-1 px-3 py-2 rounded-lg font-mono text-[12px] text-[#8b93a5] border border-[#1c212c] hover:text-white disabled:opacity-30">
            <ChevronLeft className="w-3.5 h-3.5" />Back
          </button>
          {step.action && !launched && (
            <button onClick={fireAction}
              className="cs-btn cs-focusable flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-[12px] font-semibold bg-[#a78bfa] text-[#060709] hover:bg-[#c4b5fd]">
              <Play className="w-3.5 h-3.5 fill-current" />{step.cta ?? 'Do it'}
            </button>
          )}
          {step.action && launched && waiting && (
            <span className="flex items-center gap-2 font-mono text-[12px] text-[#a78bfa]">
              <span className="w-3.5 h-3.5 border-2 border-[#a78bfa] border-t-transparent rounded-full animate-spin" />
              {step.waitLabel ?? 'Working…'}
            </span>
          )}
          <button onClick={next} disabled={waiting}
            className="cs-btn cs-focusable flex items-center gap-1 px-4 py-2 rounded-lg font-mono text-[12px] font-semibold bg-[#7dd3fc] text-[#060709] hover:bg-[#a5e3ff] disabled:opacity-40 ml-auto">
            {idx >= STEPS.length - 1 ? 'Finish' : step.cta && !step.action ? step.cta : 'Next'}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {step.id === 'agents' && (
            <button onClick={() => { onReset(); }} title="Reset the mission"
              className="cs-btn cs-focusable flex items-center gap-1 px-3 py-2 rounded-lg font-mono text-[12px] text-[#8b93a5] border border-[#1c212c] hover:text-white">
              <RotateCcw className="w-3.5 h-3.5" />Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
