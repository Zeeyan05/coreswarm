/**
 * CoreSwarm Task State Machine
 *
 * Implements deterministic state transitions for tasks.
 * Arbitrary status mutations are strictly rejected.
 * Every state transition emits a corresponding audit event.
 */

import type { TaskStatus, Task } from '../types/task';
import type { CoreSwarmEvent } from '../types/events';

export const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  CREATED: ['PLANNED'],
  PLANNED: ['DISCOVERING'],
  DISCOVERING: ['DELEGATED', 'FAILED'],
  DELEGATED: ['ACCEPTED', 'DISCOVERING', 'TIMEOUT', 'FAILED'], // DISCOVERING if rejected
  ACCEPTED: ['EXECUTING', 'TIMEOUT', 'FAILED'],
  EXECUTING: ['RESULT_SUBMITTED', 'TIMEOUT', 'FAILED'],
  RESULT_SUBMITTED: ['VERIFYING'],
  VERIFYING: ['VERIFIED', 'DISPUTED'],
  VERIFIED: ['COMPLETED'],
  DISPUTED: ['REVISION_REQUESTED', 'VERIFIED', 'FAILED'],
  REVISION_REQUESTED: ['EXECUTING'],
  REASSIGNED: ['EXECUTING', 'DISCOVERING'],
  TIMEOUT: ['REASSIGNED', 'FAILED'],
  FAILED: [], // terminal
  COMPLETED: [], // terminal
};

export type TransitionListener = (event: CoreSwarmEvent) => void;

export class TaskStateMachine {
  readonly #listeners = new Set<TransitionListener>();

  onTransition(listener: TransitionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Check if transition from current to target is allowed.
   */
  canTransition(current: TaskStatus, target: TaskStatus): boolean {
    return ALLOWED_TRANSITIONS[current]?.includes(target) ?? false;
  }

  /**
   * Transition a task to a target state, verifying invariants and emitting audit event.
   */
  transition(
    task: Task,
    target: TaskStatus,
    context: {
      actor_id: string;
      reason?: string;
      assigned_agent?: string;
      data?: Record<string, unknown>;
    },
  ): Task {
    if (!this.canTransition(task.status, target)) {
      throw new Error(
        `Invalid task state transition for '${task.task_id}': cannot move from ${task.status} to ${target}`,
      );
    }

    const updatedTask: Task = {
      ...task,
      status: target,
      assigned_agent: context.assigned_agent ?? task.assigned_agent,
      attempt: target === 'REASSIGNED' ? task.attempt + 1 : task.attempt,
    };

    const event: CoreSwarmEvent = {
      event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_type: this.#mapStatusToEventType(target),
      mission_id: task.mission_id,
      task_id: task.task_id,
      actor_id: context.actor_id,
      timestamp: new Date().toISOString(),
      data: {
        previous_status: task.status,
        new_status: target,
        reason: context.reason,
        attempt: updatedTask.attempt,
        ...context.data,
      },
    };

    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in task transition listener:', err);
      }
    }

    return updatedTask;
  }

  #mapStatusToEventType(status: TaskStatus): CoreSwarmEvent['event_type'] {
    switch (status) {
      case 'PLANNED':
        return 'TASK_CREATED';
      case 'DISCOVERING':
        return 'AGENT_DISCOVERED';
      case 'DELEGATED':
        return 'TASK_DELEGATED';
      case 'ACCEPTED':
        return 'TASK_ACCEPTED';
      case 'EXECUTING':
        return 'TASK_STARTED';
      case 'RESULT_SUBMITTED':
        return 'TASK_RESULT';
      case 'VERIFYING':
        return 'VERIFICATION_STARTED';
      case 'VERIFIED':
      case 'COMPLETED':
        return 'VERIFICATION_COMPLETED';
      case 'DISPUTED':
        return 'DISPUTE_CREATED';
      case 'REVISION_REQUESTED':
        return 'REVISION_REQUESTED';
      case 'REASSIGNED':
        return 'TASK_REASSIGNED';
      case 'TIMEOUT':
      case 'FAILED':
        return 'TASK_FAILED';
      default:
        return 'TASK_PROGRESS';
    }
  }
}
