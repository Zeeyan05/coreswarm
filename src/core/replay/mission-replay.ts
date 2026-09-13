/**
 * CoreSwarm Mission Replay Engine
 *
 * Reconstructs exact mission states by folding over the immutable event log.
 * Replay NEVER calls the LLM or network.
 */

import type { CoreSwarmEvent } from '../types/events';
import type { Mission, MissionStatus } from '../types/mission';
import type { Task, TaskStatus } from '../types/task';
import type { Claim } from '../types/claims';
import type { Evidence } from '../types/evidence';
import type { Dispute } from '../types/verification';

export interface ReconstructedMissionState {
  readonly mission_id: string;
  readonly status: MissionStatus;
  readonly event_index: number;
  readonly total_events: number;
  readonly tasks: Record<string, Task>;
  readonly claims: Record<string, Claim>;
  readonly evidence: Record<string, Evidence>;
  readonly disputes: Record<string, Dispute>;
  readonly current_event: CoreSwarmEvent | null;
}

export class MissionReplayEngine {
  readonly #events: readonly CoreSwarmEvent[];

  constructor(events: readonly CoreSwarmEvent[]) {
    this.#events = events;
  }

  get totalEvents(): number {
    return this.#events.length;
  }

  /**
   * Replay up to a specific event index (0-indexed, inclusive).
   * @param targetIndex - Index to seek to (-1 for initial empty state)
   */
  replayTo(targetIndex: number): ReconstructedMissionState {
    const clampedIndex = Math.min(this.#events.length - 1, Math.max(-1, targetIndex));

    let mission_id = 'unknown';
    let status: MissionStatus = 'CREATED';
    const tasks: Record<string, Task> = {};
    const claims: Record<string, Claim> = {};
    const evidence: Record<string, Evidence> = {};
    const disputes: Record<string, Dispute> = {};

    let current_event: CoreSwarmEvent | null = null;

    for (let i = 0; i <= clampedIndex; i++) {
      const event = this.#events[i]!;
      current_event = event;
      mission_id = event.mission_id;

      switch (event.event_type) {
        case 'MISSION_CREATED':
          status = 'CREATED';
          break;

        case 'PLAN_GENERATED':
          status = 'PLANNING';
          break;

        case 'AGENT_DISCOVERED':
          status = 'DISCOVERY';
          break;

        case 'TASK_CREATED': {
          const taskData = event.data['task'] as Task | undefined;
          if (taskData) {
            tasks[taskData.task_id] = { ...taskData, status: 'PLANNED' };
          }
          break;
        }

        case 'TASK_DELEGATED': {
          status = 'DELEGATING';
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = {
              ...tasks[event.task_id]!,
              status: 'DELEGATED',
              assigned_agent: (event.data['assigned_agent'] as string) ?? tasks[event.task_id]!.assigned_agent,
            };
          }
          break;
        }

        case 'TASK_ACCEPTED': {
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'ACCEPTED' };
          }
          break;
        }

        case 'TASK_STARTED': {
          status = 'EXECUTING';
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'EXECUTING' };
          }
          break;
        }

        case 'TASK_RESULT': {
          status = 'COLLECTING';
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = {
              ...tasks[event.task_id]!,
              status: 'RESULT_SUBMITTED',
            };
          }
          const eventClaims = event.data['claims'] as Claim[] | undefined;
          if (eventClaims) {
            for (const c of eventClaims) {
              claims[c.claim_id] = c;
            }
          }
          const eventEvidence = event.data['evidence'] as Evidence[] | undefined;
          if (eventEvidence) {
            for (const e of eventEvidence) {
              evidence[e.evidence_id] = e;
            }
          }
          break;
        }

        case 'VERIFICATION_STARTED': {
          status = 'VERIFYING';
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'VERIFYING' };
          }
          break;
        }

        case 'VERIFICATION_COMPLETED': {
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'COMPLETED' };
          }
          const verifiedClaims = event.data['verified_claims'] as Claim[] | undefined;
          if (verifiedClaims) {
            for (const vc of verifiedClaims) {
              claims[vc.claim_id] = vc;
            }
          }
          break;
        }

        case 'DISPUTE_CREATED': {
          status = 'RESOLVING';
          const disp = event.data['dispute'] as Dispute | undefined;
          if (disp) {
            disputes[disp.dispute_id] = disp;
          }
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'DISPUTED' };
          }
          break;
        }

        case 'REVISION_REQUESTED': {
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'REVISION_REQUESTED' };
          }
          break;
        }

        case 'TASK_REASSIGNED': {
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = {
              ...tasks[event.task_id]!,
              status: 'REASSIGNED',
              assigned_agent: event.data['new_agent'] as string,
              attempt: (tasks[event.task_id]!.attempt || 1) + 1,
            };
          }
          break;
        }

        case 'SYNTHESIS_STARTED':
          status = 'SYNTHESIZING';
          break;

        case 'MISSION_COMPLETED':
          status = 'COMPLETED';
          break;

        case 'TASK_FAILED':
          if (event.task_id && tasks[event.task_id]) {
            tasks[event.task_id] = { ...tasks[event.task_id]!, status: 'FAILED' };
          }
          break;
      }
    }

    return {
      mission_id,
      status,
      event_index: clampedIndex,
      total_events: this.#events.length,
      tasks,
      claims,
      evidence,
      disputes,
      current_event,
    };
  }
}
