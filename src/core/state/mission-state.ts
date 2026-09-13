/**
 * CoreSwarm Mission Lifecycle State Machine
 */

import type { MissionStatus, Mission } from '../types/mission';
import type { CoreSwarmEvent } from '../types/events';

export const ALLOWED_MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  CREATED: ['PLANNING', 'FAILED', 'ABORTED'],
  PLANNING: ['DISCOVERY', 'FAILED', 'ABORTED'],
  DISCOVERY: ['DELEGATING', 'FAILED', 'ABORTED'],
  DELEGATING: ['EXECUTING', 'FAILED', 'ABORTED'],
  EXECUTING: ['COLLECTING', 'FAILED', 'ABORTED'],
  COLLECTING: ['VERIFYING', 'FAILED', 'ABORTED'],
  VERIFYING: ['RESOLVING', 'SYNTHESIZING', 'FAILED', 'ABORTED'],
  RESOLVING: ['VERIFYING', 'SYNTHESIZING', 'FAILED', 'ABORTED'],
  SYNTHESIZING: ['COMPLETED', 'FAILED', 'ABORTED'],
  COMPLETED: [],
  FAILED: [],
  ABORTED: [],
};

export class MissionStateMachine {
  readonly #listeners = new Set<(event: CoreSwarmEvent) => void>();

  onTransition(listener: (event: CoreSwarmEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  canTransition(current: MissionStatus, target: MissionStatus): boolean {
    return ALLOWED_MISSION_TRANSITIONS[current]?.includes(target) ?? false;
  }

  transition(
    mission: Mission,
    target: MissionStatus,
    context: { actor_id: string; reason?: string; data?: Record<string, unknown> },
  ): Mission {
    if (!this.canTransition(mission.status, target)) {
      throw new Error(
        `Invalid mission state transition for '${mission.mission_id}': cannot move from ${mission.status} to ${target}`,
      );
    }

    const updatedMission: Mission = {
      ...mission,
      status: target,
    };

    const event: CoreSwarmEvent = {
      event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_type: this.#mapStatusToEventType(target),
      mission_id: mission.mission_id,
      actor_id: context.actor_id,
      timestamp: new Date().toISOString(),
      data: {
        previous_status: mission.status,
        new_status: target,
        reason: context.reason,
        ...context.data,
      },
    };

    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in mission transition listener:', err);
      }
    }

    return updatedMission;
  }

  #mapStatusToEventType(status: MissionStatus): CoreSwarmEvent['event_type'] {
    switch (status) {
      case 'PLANNING':
        return 'PLAN_GENERATED';
      case 'DISCOVERY':
        return 'AGENT_DISCOVERED';
      case 'DELEGATING':
        return 'TASK_DELEGATED';
      case 'SYNTHESIZING':
        return 'SYNTHESIS_STARTED';
      case 'COMPLETED':
        return 'MISSION_COMPLETED';
      default:
        return 'TASK_PROGRESS';
    }
  }
}
