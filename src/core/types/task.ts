/**
 * CoreSwarm Task Model and State Machine Definitions
 */

import type { Claim } from './claims';
import type { Evidence } from './evidence';

export type TaskType =
  | 'RESEARCH'
  | 'ANALYSIS'
  | 'SECURITY_AUDIT'
  | 'VERIFICATION'
  | 'SYNTHESIS';

/**
 * 16 Explicit Task States strictly enforced by the Task State Machine.
 */
export type TaskStatus =
  | 'CREATED'
  | 'PLANNED'
  | 'DISCOVERING'
  | 'DELEGATED'
  | 'ACCEPTED'
  | 'EXECUTING'
  | 'RESULT_SUBMITTED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'DISPUTED'
  | 'REVISION_REQUESTED'
  | 'REASSIGNED'
  | 'TIMEOUT'
  | 'FAILED'
  | 'COMPLETED';

export interface TaskResult {
  readonly result_id: string; // res_...
  readonly task_id: string;
  readonly agent_id: string;
  readonly summary: string;
  readonly claims: readonly Claim[];
  readonly evidence: readonly Evidence[];
  readonly limitations: readonly string[];
  readonly submitted_at: string;
}

export interface Task {
  readonly task_id: string; // task_...
  readonly mission_id: string;
  readonly parent_task_id?: string;
  readonly type: TaskType;
  readonly title: string;
  readonly objective: string;
  readonly requirements: readonly string[];
  readonly required_capabilities: readonly string[];
  readonly dependencies: readonly string[]; // Upstream task IDs
  readonly status: TaskStatus;
  readonly assigned_agent?: string; // agent_id
  readonly attempt: number;
  readonly created_at: string;
  readonly deadline: string;
  readonly result_id?: string;
  readonly result?: TaskResult;
}
