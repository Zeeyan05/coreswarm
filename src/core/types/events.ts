/**
 * CoreSwarm Event Sourcing & Audit Types
 *
 * Every significant coordination state change generates an immutable event.
 * Replay reconstructs complete mission state from these events without LLM invocation.
 */

export type CoreSwarmEventType =
  | 'MISSION_CREATED'
  | 'PLAN_GENERATED'
  | 'AGENT_DISCOVERED'
  | 'TASK_CREATED'
  | 'TASK_DELEGATED'
  | 'TASK_ACCEPTED'
  | 'TASK_REJECTED'
  | 'TASK_STARTED'
  | 'TASK_PROGRESS'
  | 'TASK_RESULT'
  | 'EVIDENCE_ADDED'
  | 'VERIFICATION_STARTED'
  | 'VERIFICATION_COMPLETED'
  | 'DISPUTE_CREATED'
  | 'REVISION_REQUESTED'
  | 'TASK_REASSIGNED'
  | 'TASK_FAILED'
  | 'SYNTHESIS_STARTED'
  | 'MISSION_COMPLETED';

export interface CoreSwarmEvent {
  readonly event_id: string; // evt_...
  readonly event_type: CoreSwarmEventType;
  readonly mission_id: string;
  readonly task_id?: string;
  readonly actor_id: string; // agent_id or orchestrator
  readonly timestamp: string; // ISO 8601
  readonly data: Record<string, unknown>;
  readonly message_id?: string;
}
