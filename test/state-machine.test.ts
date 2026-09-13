import { describe, it, expect } from 'vitest';
import { TaskStateMachine } from '../src/core/state/task-state';
import type { Task } from '../src/core/types/task';

describe('TaskStateMachine', () => {
  const baseTask: Task = {
    task_id: 'task_01',
    mission_id: 'mission_01',
    type: 'RESEARCH',
    title: 'Audit Crypto',
    objective: 'Verify DID encoding',
    requirements: [],
    required_capabilities: ['research'],
    dependencies: [],
    status: 'CREATED',
    attempt: 1,
    created_at: new Date().toISOString(),
    deadline: new Date().toISOString(),
  };

  it('allows legal task state transitions and increments attempt on reassignment', () => {
    const sm = new TaskStateMachine();

    let task = sm.transition(baseTask, 'PLANNED', { actor_id: 'orchestrator' });
    expect(task.status).toBe('PLANNED');

    task = sm.transition(task, 'DISCOVERING', { actor_id: 'orchestrator' });
    expect(task.status).toBe('DISCOVERING');

    task = sm.transition(task, 'DELEGATED', { actor_id: 'orchestrator', assigned_agent: 'researcher-01' });
    expect(task.status).toBe('DELEGATED');
    expect(task.assigned_agent).toBe('researcher-01');

    task = sm.transition(task, 'ACCEPTED', { actor_id: 'researcher-01' });
    expect(task.status).toBe('ACCEPTED');

    task = sm.transition(task, 'EXECUTING', { actor_id: 'researcher-01' });
    expect(task.status).toBe('EXECUTING');

    task = sm.transition(task, 'RESULT_SUBMITTED', { actor_id: 'researcher-01' });
    expect(task.status).toBe('RESULT_SUBMITTED');

    task = sm.transition(task, 'VERIFYING', { actor_id: 'orchestrator' });
    expect(task.status).toBe('VERIFYING');

    task = sm.transition(task, 'VERIFIED', { actor_id: 'verifier-01' });
    expect(task.status).toBe('VERIFIED');

    task = sm.transition(task, 'COMPLETED', { actor_id: 'orchestrator' });
    expect(task.status).toBe('COMPLETED');
  });

  it('rejects illegal transitions with descriptive error', () => {
    const sm = new TaskStateMachine();

    // Cannot jump directly from CREATED to COMPLETED
    expect(() =>
      sm.transition(baseTask, 'COMPLETED', { actor_id: 'orchestrator' }),
    ).toThrow(/Invalid task state transition/);

    // Cannot jump from EXECUTING to COMPLETED without submitting results & verifying
    const executingTask: Task = { ...baseTask, status: 'EXECUTING' };
    expect(() =>
      sm.transition(executingTask, 'COMPLETED', { actor_id: 'orchestrator' }),
    ).toThrow(/cannot move from EXECUTING to COMPLETED/);
  });
});
