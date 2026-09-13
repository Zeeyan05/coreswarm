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
        <div className="cs-panel p-12 text-center font-mono text-[11px] text-[#3d4350]">Discovering agents…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map((a, i) => {
            const mine = forAgent(a.agent_id);
            const active = mine.filter((t) => t.status === 'EXECUTING' || t.status === 'VERIFYING');
            const done = mine.filter((t) => t.status === 'COMPLETED');
            return (
              <div key={a.agent_id} className="cs-panel p-5 space-y-3 cs-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-[#0e1118] border border-[#a78bfa]/30 flex items-center justify-center">
                      <Cpu className="w-4 h-4 text-[#a78bfa]" />
                    </div>
                    <div>
                      <div className="font-display text-[14px] font-semibold text-white">{a.name}</div>
                      <div className="font-mono text-[10px] text-[#5d6474]">{a.agent_id}</div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#8b93a5] px-2 py-1 rounded-md border border-[#1c212c] bg-[#0e1118]">
                    <StateDot state={a.availability === 'AVAILABLE' ? 'IDLE' : 'ACTIVE'} size="sm" />
                    {a.availability}
                  </span>
                </div>

                <p className="text-[12px] text-[#8b93a5] leading-relaxed">{a.description}</p>

                <div className="rounded-md border border-[#1c212c] bg-[#0e1118] p-2.5">
                  <div className="cs-label mb-1">Cryptographic identity</div>
                  <Did value={a.did} className="text-[11px]" />
                </div>

                <div>
                  <div className="cs-label mb-1.5">Capabilities</div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.capabilities.map((c) => (
                      <span key={c} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#1c212c] bg-[#0e1118] text-[#b8c0cf]">{c}</span>
                    ))}
                  </div>
                </div>

                <div className="border-t cs-hairline pt-2.5">
                  <div className="cs-label mb-1.5">Current work ({mine.length})</div>
                  {mine.length === 0 ? (
                    <div className="font-mono text-[10px] text-[#3d4350]">idle — awaiting delegation</div>
                  ) : (
                    <div className="space-y-1">
                      {mine.map((t) => (
                        <div key={t.task_id} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                          <span className="text-[#b8c0cf] truncate">{t.title}</span>
                          <span className="text-[#5d6474] shrink-0">{t.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(active.length > 0 || done.length > 0) && (
                    <div className="mt-1.5 font-mono text-[10px] text-[#3d4350]">
                      {active.length > 0 && <span className="text-[#7dd3fc]">{active.length} active</span>}
                      {active.length > 0 && done.length > 0 && ' · '}
                      {done.length > 0 && <span className="text-[#5eead4]">{done.length} done</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] text-[#3d4350]">
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
