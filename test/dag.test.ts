import { describe, it, expect } from 'vitest';
import { TaskDAG } from '../src/core/dag/task-dag';
import type { Task } from '../src/core/types/task';

describe('TaskDAG', () => {
  const createTask = (id: string, deps: string[] = []): Task => ({
    task_id: id,
    mission_id: 'mission_test',
    type: 'RESEARCH',
    title: `Task ${id}`,
    objective: `Objective for ${id}`,
    requirements: [],
    required_capabilities: ['research'],
    dependencies: deps,
    status: 'PLANNED',
    attempt: 1,
    created_at: new Date().toISOString(),
    deadline: new Date().toISOString(),
  });

  it('detects ready tasks with no dependencies initially', () => {
    const dag = new TaskDAG();
    const taskA = createTask('task_a', []);
    const taskB = createTask('task_b', ['task_a']);

    dag.addTask(taskA);
    dag.addTask(taskB);

    const ready0 = dag.getReadyTasks(new Set());
    expect(ready0.map((t) => t.task_id)).toEqual(['task_a']);

    const ready1 = dag.getReadyTasks(new Set(['task_a']));
    expect(ready1.map((t) => t.task_id)).toEqual(['task_b']);
  });

  it('detects circular dependencies and throws an error', () => {
    const dag = new TaskDAG();
    const taskA = createTask('task_a', ['task_c']);
    const taskB = createTask('task_b', ['task_a']);
    const taskC = createTask('task_c', ['task_b']);

    dag.addTask(taskA);
    dag.addTask(taskB);

    expect(() => dag.addTask(taskC)).toThrow(/Circular dependency detected/);
  });

  it('topologically sorts tasks in correct execution dependency order', () => {
    const dag = new TaskDAG();
    const taskA = createTask('task_a', []);
    const taskB = createTask('task_b', ['task_a']);
    const taskC = createTask('task_c', ['task_a']);
    const taskD = createTask('task_d', ['task_b', 'task_c']);

    dag.addTasks([taskA, taskB, taskC, taskD]);

    const order = dag.topologicalSort().map((t) => t.task_id);
    expect(order.indexOf('task_a')).toBeLessThan(order.indexOf('task_b'));
    expect(order.indexOf('task_a')).toBeLessThan(order.indexOf('task_c'));
    expect(order.indexOf('task_b')).toBeLessThan(order.indexOf('task_d'));
    expect(order.indexOf('task_c')).toBeLessThan(order.indexOf('task_d'));
  });
});
