import { describe, it, expect } from 'vitest';
import { MissionReplayEngine } from '../src/core/replay/mission-replay';
import type { CoreSwarmEvent } from '../src/core/types/events';

describe('MissionReplayEngine', () => {
  it('reconstructs mission state at any event index without calling an LLM', () => {
    const events: CoreSwarmEvent[] = [
      {
        event_id: 'evt_1',
        event_type: 'MISSION_CREATED',
        mission_id: 'mission_replay_test',
        actor_id: 'orchestrator',
        timestamp: '2026-09-12T00:00:00.000Z',
        data: {},
      },
      {
        event_id: 'evt_2',
        event_type: 'PLAN_GENERATED',
        mission_id: 'mission_replay_test',
        actor_id: 'orchestrator',
        timestamp: '2026-09-12T00:00:01.000Z',
        data: {},
      },
      {
        event_id: 'evt_3',
        event_type: 'TASK_CREATED',
        mission_id: 'mission_replay_test',
        task_id: 'task_01',
        actor_id: 'orchestrator',
        timestamp: '2026-09-12T00:00:02.000Z',
        data: {
          task: {
            task_id: 'task_01',
            mission_id: 'mission_replay_test',
            type: 'RESEARCH',
            title: 'Audit Sweep',
            objective: 'Verify sweep',
            requirements: [],
            required_capabilities: ['research'],
            dependencies: [],
            status: 'PLANNED',
            attempt: 1,
            created_at: '2026-09-12T00:00:02.000Z',
            deadline: '2026-09-12T00:01:00.000Z',
          },
        },
      },
      {
        event_id: 'evt_4',
        event_type: 'TASK_DELEGATED',
        mission_id: 'mission_replay_test',
        task_id: 'task_01',
        actor_id: 'orchestrator',
        timestamp: '2026-09-12T00:00:03.000Z',
        data: { assigned_agent: 'researcher-01' },
      },
      {
        event_id: 'evt_5',
        event_type: 'MISSION_COMPLETED',
        mission_id: 'mission_replay_test',
        actor_id: 'orchestrator',
        timestamp: '2026-09-12T00:00:10.000Z',
        data: {},
      },
    ];

    const engine = new MissionReplayEngine(events);
    expect(engine.totalEvents).toBe(5);

    // Replay to step 0
    const state0 = engine.replayTo(0);
    expect(state0.status).toBe('CREATED');
    expect(Object.keys(state0.tasks).length).toBe(0);

    // Replay to step 2 (task created)
    const state2 = engine.replayTo(2);
    expect(state2.tasks['task_01']).toBeDefined();
    expect(state2.tasks['task_01']?.status).toBe('PLANNED');

    // Replay to step 3 (task delegated)
    const state3 = engine.replayTo(3);
    expect(state3.tasks['task_01']?.status).toBe('DELEGATED');
    expect(state3.tasks['task_01']?.assigned_agent).toBe('researcher-01');

    // Replay to final step
    const stateFinal = engine.replayTo(4);
    expect(stateFinal.status).toBe('COMPLETED');
  });
});
