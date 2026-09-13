'use client';

import React from 'react';
import { Cpu } from 'lucide-react';
import { Did, StateDot, SectionHead } from './primitives';
import type { AgentMetadata } from '../core/types/agent';
import type { Task } from '../core/types/task';

/**
 * Agent constellation: who participates, what they can do, what they're on.
 * DIDs in compact cryptographic style. No invented wallets or scores —
 * only registry metadata + real task assignments.
 */

export function AgentConstellation({ agents, tasks }: { agents: AgentMetadata[]; tasks: Record<string, Task> }) {
  const taskList = Object.values(tasks);
  const forAgent = (id: string) => taskList.filter((t) => t.assigned_agent === id);

  return (
    <div className="space-y-4">
      <SectionHead
        kicker="Agents · network registry"
        title="Who is participating"
        right={<span className="font-mono text-[11px] text-[#5d6474]">{agents.length} discovered</span>}
      />

      {agents.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cs-panel p-5 space-y-3">
              <div className="cs-skeleton h-9 w-2/3" />
              <div className="cs-skeleton h-3 w-full" />
              <div className="cs-skeleton h-3 w-4/5" />
              <div className="cs-skeleton h-8 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((a, i) => {
            const mine = forAgent(a.agent_id);
            const active = mine.filter((t) => t.status === 'EXECUTING' || t.status === 'VERIFYING');
            const done = mine.filter((t) => t.status === 'COMPLETED');
            return (
              <div key={a.agent_id} className="cs-panel cs-panel-interactive p-5 md:p-6 space-y-4 cs-rise" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-[#0e1118] border border-[#a78bfa]/30 flex items-center justify-center shrink-0">
                      <Cpu className="w-[18px] h-[18px] text-[#a78bfa]" />
                    </div>
                    <div className="min-w-0">
                      <div className="cs-display-sm text-white truncate">{a.name}</div>
                      <div className="font-mono text-[11px] text-[#5d6474]">{a.agent_id}</div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#8b93a5] px-2.5 py-1.5 rounded-lg border border-[#1c212c] bg-[#0e1118] shrink-0">
                    <StateDot state={a.availability === 'AVAILABLE' ? 'IDLE' : 'ACTIVE'} size="sm" />
                    {a.availability}
                  </span>
                </div>

                <p className="cs-body text-[#8b93a5]">{a.description}</p>

                <div className="rounded-lg border border-[#1c212c] bg-[#0e1118] p-3">
                  <div className="cs-label mb-1.5">Cryptographic identity</div>
                  <Did value={a.did} />
                </div>

                <div>
                  <div className="cs-label mb-2">Capabilities</div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.capabilities.map((c) => (
                      <span key={c} className="font-mono text-[11px] px-2 py-1 rounded-md border border-[#1c212c] bg-[#0e1118] text-[#b8c0cf]">{c}</span>
                    ))}
                  </div>
                </div>

                <div className="border-t cs-hairline pt-3.5">
                  <div className="cs-label mb-2">Current work ({mine.length})</div>
                  {mine.length === 0 ? (
                    <div className="font-mono text-[11px] text-[#3d4350]">idle — awaiting delegation</div>
                  ) : (
                    <div className="space-y-1.5">
                      {mine.map((t) => (
                        <div key={t.task_id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <span className="text-[#b8c0cf] truncate">{t.title}</span>
                          <span className="text-[#5d6474] shrink-0">{t.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(active.length > 0 || done.length > 0) && (
                    <div className="mt-2 font-mono text-[11px] text-[#3d4350] tabular-nums">
                      {active.length > 0 && <span className="text-[#7dd3fc]">{active.length} active</span>}
                      {active.length > 0 && done.length > 0 && ' · '}
                      {done.length > 0 && <span className="text-[#5eead4]">{done.length} done</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between font-mono text-[11px] text-[#3d4350]">
                  <span className="truncate">{a.endpoint}</span>
                  <span className="shrink-0 ml-2">{a.supported_protocol_versions.join(', ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
