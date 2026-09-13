/**
 * CoreSwarm Timeout and Failure Monitor
 */

import type { Task } from '../types/task';

export interface TimeoutHandler {
  onTimeout(task: Task): Promise<void> | void;
}

export class TimeoutMonitor {
  readonly #activeTimers = new Map<string, NodeJS.Timeout>();

  armTimeout(task: Task, deadlineMs: number, handler: TimeoutHandler): void {
    this.disarmTimeout(task.task_id);

    const timer = setTimeout(() => {
      this.#activeTimers.delete(task.task_id);
      void (async () => {
        try {
          await handler.onTimeout(task);
        } catch (err) {
          console.error(`Timeout handler failed for task '${task.task_id}':`, err);
        }
      })();
    }, Math.max(0, deadlineMs));

    // Don't hold the process open for armed timeouts alone.
    (timer as unknown as { unref?: () => void }).unref?.();

    this.#activeTimers.set(task.task_id, timer);
  }

  disarmTimeout(taskId: string): void {
    const timer = this.#activeTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.#activeTimers.delete(taskId);
    }
  }

  disarmAll(): void {
    for (const timer of this.#activeTimers.values()) {
      clearTimeout(timer);
    }
    this.#activeTimers.clear();
  }
}
