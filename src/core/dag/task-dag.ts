/**
 * CoreSwarm Task Directed Acyclic Graph (DAG)
 *
 * Enforces:
 * - Cycle-free dependency graph (throws if cycle detected)
 * - Topological ordering of execution
 * - Concurrency scheduling: computes ready tasks whose dependencies are COMPLETED
 */

import type { Task } from '../types/task';

export class TaskDAG {
  readonly #tasks = new Map<string, Task>();
  readonly #dependencies = new Map<string, Set<string>>(); // taskId -> set of upstream taskIds
  readonly #dependents = new Map<string, Set<string>>(); // taskId -> set of downstream taskIds

  /**
   * Add a task to the DAG.
   */
  addTask(task: Task): void {
    this.#tasks.set(task.task_id, task);
    if (!this.#dependencies.has(task.task_id)) {
      this.#dependencies.set(task.task_id, new Set(task.dependencies));
    }
    if (!this.#dependents.has(task.task_id)) {
      this.#dependents.set(task.task_id, new Set());
    }

    // Register downstream links
    for (const depId of task.dependencies) {
      if (!this.#dependents.has(depId)) {
        this.#dependents.set(depId, new Set());
      }
      this.#dependents.get(depId)!.add(task.task_id);
    }

    // Validate no cycle was introduced
    this.validateNoCycles();
  }

  /**
   * Add multiple tasks and validate graph integrity.
   */
  addTasks(tasks: readonly Task[]): void {
    for (const task of tasks) {
      this.addTask(task);
    }
    this.validateIntegrity();
  }

  /**
   * Update task in DAG.
   */
  updateTask(task: Task): void {
    if (!this.#tasks.has(task.task_id)) {
      throw new Error(`Task '${task.task_id}' does not exist in DAG`);
    }
    this.#tasks.set(task.task_id, task);
  }

  getTask(taskId: string): Task | undefined {
    return this.#tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.#tasks.values());
  }

  /**
   * Find tasks whose dependencies are all satisfied and are ready to execute.
   */
  getReadyTasks(completedTaskIds: ReadonlySet<string>): Task[] {
    const ready: Task[] = [];
    for (const [taskId, task] of this.#tasks) {
      // If already completed, skip
      if (completedTaskIds.has(taskId)) {
        continue;
      }

      // Eligible only if planned or created
      if (task.status !== 'PLANNED' && task.status !== 'CREATED') {
        continue;
      }
      const deps = this.#dependencies.get(taskId) ?? new Set();
      const allDepsMet = Array.from(deps).every((d) => completedTaskIds.has(d));
      if (allDepsMet) {
        ready.push(task);
      }
    }
    return ready;
  }

  /**
   * Check if any referenced dependency does not exist in the DAG.
   */
  validateIntegrity(): void {
    for (const [taskId, deps] of this.#dependencies) {
      for (const depId of deps) {
        if (!this.#tasks.has(depId)) {
          throw new Error(`Task '${taskId}' has missing dependency '${depId}'`);
        }
      }
    }
  }

  /**
   * Cycle detection using DFS graph coloring:
   * 0: unvisited, 1: visiting (in current stack), 2: visited
   */
  validateNoCycles(): void {
    const state = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

    const visit = (taskId: string, path: string[]): void => {
      state.set(taskId, 1);
      const deps = this.#dependencies.get(taskId) ?? new Set();
      for (const depId of deps) {
        const depState = state.get(depId) ?? 0;
        if (depState === 1) {
          throw new Error(
            `Circular dependency detected in Task DAG: ${[...path, taskId, depId].join(' -> ')}`,
          );
        }
        if (depState === 0) {
          visit(depId, [...path, taskId]);
        }
      }
      state.set(taskId, 2);
    };

    for (const taskId of this.#tasks.keys()) {
      if ((state.get(taskId) ?? 0) === 0) {
        visit(taskId, []);
      }
    }
  }

  /**
   * Topological sort of all tasks.
   */
  topologicalSort(): Task[] {
    this.validateNoCycles();
    this.validateIntegrity();

    const visited = new Set<string>();
    const order: Task[] = [];

    const dfs = (taskId: string): void => {
      visited.add(taskId);
      const deps = this.#dependencies.get(taskId) ?? new Set();
      for (const depId of deps) {
        if (!visited.has(depId)) {
          dfs(depId);
        }
      }
      order.push(this.#tasks.get(taskId)!);
    };

    for (const taskId of this.#tasks.keys()) {
      if (!visited.has(taskId)) {
        dfs(taskId);
      }
    }

    return order;
  }
}
